import { mkdir, writeFile } from 'fs/promises'

export const prepareDirectory = async ({ folderPath }: { folderPath: string }) => {
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
