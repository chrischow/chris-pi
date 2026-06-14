import { createReadStream, readFileSync, writeFileSync } from 'fs'
import { mkdir, readdir, readFile, stat, writeFile } from 'fs/promises'
import path, { dirname, resolve } from 'path'
import { createInterface } from 'readline'
import { fileURLToPath } from 'url'

import { type EvalResult, type GradeResult, GradeResultSchema, type SessionStats } from './schema'

export const prepareDirectory = async ({ folderPath }: { folderPath: string }) => {
  await mkdir(folderPath, { recursive: true }).catch((error) => {
    console.error(error)
    throw new Error(`Error creating folder: ${folderPath}`)
  })
}

export const getStartingTrialNum = async ({ gradeResultFolder }: { gradeResultFolder: string }): Promise<number> => {
  await prepareDirectory({ folderPath: gradeResultFolder })

  const filenames = await readdir(gradeResultFolder).catch((error) => {
    console.error(error)
    throw new Error('Could not read grading result directory.')
  })

  let trialNum = 1
  if (filenames.length === 0) {
    return trialNum
  }

  for (const filename of filenames) {
    if (path.extname(filename).toLowerCase() !== '.json') {
      continue
    }
    const filepath = path.join(gradeResultFolder, filename)

    // File check
    const s = await stat(filepath).catch((error) => {
      console.error(error)
      throw new Error(`Could not determine if path is a folder or file: ${filepath}`)
    })

    if (!s.isFile()) {
      continue
    }

    // Parse data
    const rawData = await readFile(filepath, 'utf8').catch((error) => {
      console.error(error)
      throw new Error(`Could not read file: ${filepath}`)
    })

    try {
      const { success, data } = GradeResultSchema.safeParse(JSON.parse(rawData))
      if (!success) {
        throw new Error(`Grade file data does not match schema: ${filepath}`)
      }
      trialNum = Math.max(trialNum, data.trialNum)
    } catch (error) {
      console.error(error)
      throw new Error(`Could not parse grade file: ${filepath}`, { cause: error })
    }
  }

  return trialNum + 1
}

export const computeSessionStats = async ({
  trialNum,
  filepath,
}: {
  trialNum: number
  filepath: string
}): Promise<SessionStats> => {
  let numInputTokens = 0
  let numOutputTokens = 0
  let numTurns = 0
  let numToolCalls = 0

  // Create a readable stream for the file
  const fileStream = createReadStream(filepath)

  // Interface to read the stream line by line
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity, // Recognizes all instances of CR LF (\r\n) as a single line break
  })

  try {
    // Loop through each line asynchronously
    for await (const line of rl) {
      // Skip empty lines to prevent JSON parsing errors
      if (!line.trim()) continue

      const item = JSON.parse(line)
      const { message } = item
      if (!message) {
        continue
      }

      const { role, usage } = message

      if (role && role === 'toolResult') {
        numToolCalls += 1
        continue
      }

      if (!role || role !== 'assistant') {
        continue
      }

      // All assistant messages are turns
      numTurns += 1

      if (usage) {
        const { input, output } = usage
        numInputTokens += input
        numOutputTokens += output
      }
    }

    return {
      trialNum,
      numInputTokens,
      numOutputTokens,
      numTurns,
      numToolCalls,
    }
  } catch (error) {
    console.error(error)
    throw new Error('Could not compute session stats.', { cause: error })
  }
}

export const saveFile = async ({
  data,
  folderPath,
  filename,
}: {
  data: object
  folderPath: string
  filename: string
}): Promise<void> => {
  await prepareDirectory({ folderPath })

  await writeFile(`${folderPath}/${filename}`, JSON.stringify(data), 'utf8').catch((error) => {
    console.error(error)
    throw new Error('Error writing to file.')
  })
}

export const calculatePassAtK = ({
  numTrials,
  numCorrect,
  k,
}: {
  numTrials: number
  numCorrect: number
  k: number
}): number => {
  // If incorrect samples (n - c) are fewer than k, success is guaranteed
  if (numTrials - numCorrect < k) return 1.0

  let product = 1.0

  // Computes the product of (n - c - i) / (n - i) for i from 0 to k-1
  for (let i = 0; i < k; i++) {
    product *= (numTrials - numCorrect - i) / (numTrials - i)
  }

  return 1.0 - product
}

export const computeEvalResult = async ({
  name,
  folderPath,
}: {
  name: string
  folderPath: string
}): Promise<EvalResult> => {
  const filenames = await readdir(folderPath).catch((error) => {
    console.error(error)
    throw new Error('Could not read grading result directory.')
  })

  // Initialise stats
  let totalTrials: number = 0
  let totalCorrectTrials: number = 0
  let averageCompletionPercentage: number = 0
  const numInputTokens: number[] = []
  const numOutputTokens: number[] = []
  const numTurns: number[] = []
  const numToolCalls: number[] = []
  const passAtK: number[] = []
  const passPowerK: number[] = []

  // Loop through files
  for (const filename of filenames) {
    if (path.extname(filename).toLowerCase() !== '.json') {
      continue
    }
    const filepath = path.join(folderPath, filename)

    // File check
    const s = await stat(filepath).catch((error) => {
      console.error(error)
      throw new Error(`Could not determine if path is a folder or file: ${filepath}`)
    })
    if (!s.isFile()) {
      continue
    }

    // Parse data
    const rawData = await readFile(filepath, 'utf8').catch((error) => {
      console.error(error)
      throw new Error(`Could not read file: ${filepath}`)
    })

    let data: GradeResult

    try {
      const { success, data: parsedData } = GradeResultSchema.safeParse(JSON.parse(rawData))
      if (!success) {
        throw new Error(`Grade file data does not match schema: ${filepath}`)
      }
      data = parsedData
    } catch (error) {
      console.error(error)
      throw new Error(`Could not parse grade file: ${filepath}`, { cause: error })
    }

    // Update stats
    totalTrials += 1
    if (data.completionPercentage === 1) {
      totalCorrectTrials += 1
    }
    averageCompletionPercentage += data.completionPercentage
    numInputTokens.push(data.numInputTokens)
    numOutputTokens.push(data.numOutputTokens)
    numTurns.push(data.numTurns)
    numToolCalls.push(data.numToolCalls)
  }

  // Compute pass stats
  const passRate = totalCorrectTrials / totalTrials
  averageCompletionPercentage /= totalTrials
  for (let k = 1; k <= totalTrials; k++) {
    passAtK.push(calculatePassAtK({ numTrials: totalTrials, numCorrect: totalCorrectTrials, k }))
    passPowerK.push(passRate ** k)
  }

  return {
    name,
    totalTrials,
    totalCorrectTrials,
    passRate,
    averageCompletionPercentage,
    numInputTokens: numInputTokens.sort(),
    numOutputTokens: numOutputTokens.sort(),
    numTurns: numTurns.sort(),
    numToolCalls: numToolCalls.sort(),
    passAtK,
    passPowerK,
  }
}

export const generateEvalReport = ({ evalResult, folderPath }: { evalResult: EvalResult; folderPath: string }) => {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const htmlPath = resolve(__dirname, '..', 'assets', 'report.html')

  const reportTemplate = readFileSync(htmlPath, 'utf-8')
  const report = reportTemplate.replace(
    `var INLINE_STATS = null`,
    `var INLINE_STATS = ${JSON.stringify(evalResult, null, 2)}`,
  )

  writeFileSync(`${folderPath}/eval_report.html`, report, 'utf-8')
}
