import http from 'node:http'
import { exec } from 'node:child_process'
import crypto from 'node:crypto'
import { URL } from 'node:url'
import chalk from 'chalk'
import ora from 'ora'
import { writeConfig } from '../lib/config.js'

const APP_URL = 'https://specdown.app'
const TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

const SUCCESS_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>SpecDown CLI</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fff}
.card{text-align:center;padding:2rem;border-radius:1rem;border:1px solid #333;background:#111;max-width:320px}
h2{margin:0 0 .5rem}p{color:#888;margin:0}</style></head>
<body><div class="card"><div style="font-size:3rem">✅</div><h2>Logged in!</h2><p>You can close this tab and return to your terminal.</p></div></body></html>`

function openBrowser(url: string) {
  const platform = process.platform
  const cmd =
    platform === 'darwin' ? `open "${url}"` :
    platform === 'win32' ? `start "" "${url}"` :
    `xdg-open "${url}"`
  exec(cmd)
}

export async function login() {
  console.log(chalk.bold('\nSpecDown Login\n'))

  // Pick a random available port in 7400–7499
  const port = 7400 + Math.floor(Math.random() * 100)
  const state = crypto.randomBytes(16).toString('hex')

  const authUrl = `${APP_URL}/cli/auth?port=${port}&state=${state}`

  return new Promise<void>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405)
        res.end()
        return
      }

      try {
        const parsed = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
        const params = parsed.searchParams

        if (params.get('state') !== state) {
          res.writeHead(403, { 'Content-Type': 'text/plain' })
          res.end('Invalid state')
          return
        }

        writeConfig({
          access_token: params.get('access_token') ?? '',
          refresh_token: params.get('refresh_token') ?? '',
          user_email: params.get('email') ?? '',
          user_id: params.get('user_id') ?? '',
        })

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(SUCCESS_HTML)

        spinner.succeed(chalk.green(`Logged in as ${chalk.bold(params.get('email'))}`))
        server.close()
        resolve()
      } catch {
        res.writeHead(400)
        res.end('Bad request')
      }
    })

    const spinner = ora()

    server.listen(port, '127.0.0.1', () => {
      console.log(chalk.cyan('Opening browser to complete login…'))
      console.log(chalk.dim(`  ${authUrl}\n`))
      console.log(chalk.dim('If browser did not open, visit the URL above manually.\n'))
      openBrowser(authUrl)
      spinner.start('Waiting for authentication…')
    })

    // Timeout
    const timer = setTimeout(() => {
      spinner.fail(chalk.red('Login timed out (5 minutes). Run `specdown login` again.'))
      server.close()
      reject(new Error('timeout'))
    }, TIMEOUT_MS)

    server.on('close', () => clearTimeout(timer))
    server.on('error', (err) => {
      spinner.fail(chalk.red('Could not start local server: ' + err.message))
      reject(err)
    })
  })
}
