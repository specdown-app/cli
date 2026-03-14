import { createInterface } from 'readline'

export function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

export function askPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question)
    const stdin = process.stdin
    const chunks: Buffer[] = []
    stdin.setRawMode(true)
    stdin.resume()
    stdin.on('data', function handler(chunk: Buffer) {
      const char = chunk.toString()
      if (char === '\r' || char === '\n') {
        stdin.setRawMode(false)
        stdin.pause()
        stdin.removeListener('data', handler)
        process.stdout.write('\n')
        resolve(Buffer.concat(chunks).toString())
      } else if (char === '\u0003') {
        process.exit()
      } else if (char === '\u007f') {
        // backspace
        if (chunks.length) chunks.pop()
      } else {
        chunks.push(chunk)
      }
    })
  })
}
