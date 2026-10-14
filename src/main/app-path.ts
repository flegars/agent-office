import { isAbsolute, relative, resolve } from 'node:path'

export function resolveAppPath(rootDir: string, requestUrl: string): string | null {
  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(requestUrl).pathname)
  } catch {
    return null
  }
  const root = resolve(rootDir)
  const filePath = resolve(root, `.${pathname}`)
  const fromRoot = relative(root, filePath)
  if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    return null
  }
  return filePath
}
