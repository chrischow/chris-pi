import { mkdir, readdir, readFile, stat, writeFile } from 'fs/promises'
import path from 'path'

export const prepareDirectory = async ({ folderPath }: { folderPath: string }): Promise<void> => {
  await mkdir(folderPath, { recursive: true }).catch((error) => {
    console.error(error)
    throw new Error(`Error creating folder: ${folderPath}`)
  })
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

export const getAllFilesInDirectory = async ({ folderPath }: { folderPath: string }): Promise<string[]> => {
  const filenames = await readdir(folderPath).catch((error) => {
    console.error(error)
    throw new Error(`Could not read files from directory: ${folderPath}`)
  })

  return filenames
}

export const readFileContent = async ({ filepath, ext }: { filepath: string; ext: string }): Promise<string | null> => {
  if (path.extname(filepath).toLowerCase() !== `.${ext}`) {
    return null
  }

  // File check
  const s = await stat(filepath).catch((error) => {
    console.error(error)
    return null
  })

  if (!s || !s.isFile()) {
    return null
  }

  // Parse data
  const rawData = await readFile(filepath, 'utf8').catch((error) => {
    console.error(error)
    return null
  })

  return rawData
}
