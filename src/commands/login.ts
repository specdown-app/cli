import http from 'node:http'
import { exec } from 'node:child_process'
import crypto from 'node:crypto'
import chalk from 'chalk'
import ora from 'ora'
import { writeConfig } from '../lib/config.js'

const APP_URL = 'https://specdown.app'
const TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

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
      // Allow CORS from the SpecDown web app
      res.setHeader('Access-Control-Allow-Origin', APP_URL)
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      if (req.method !== 'POST') {
        res.writeHead(405)
        res.end()
        return
      }

      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        try {
          const payload = JSON.parse(body) as {
            state: string
            access_token: string
            refresh_token: string
            email: string
            user_id: string
          }

          if (payload.state !== state) {
            res.writeHead(403)
            res.end(JSON.stringify({ error: 'Invalid state' }))
            return
          }

          writeConfig({
            access_token: payload.access_token,
            refresh_token: payload.refresh_token,
            user_email: payload.email,
            user_id: payload.user_id,
          })

          res.writeHead(200)
          res.end(JSON.stringify({ ok: true }))

          spinner.succeed(chalk.green(`Logged in as ${chalk.bold(payload.email)}`))
          server.close()
          resolve()
        } catch {
          res.writeHead(400)
          res.end(JSON.stringify({ error: 'Bad request' }))
        }
      })
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
