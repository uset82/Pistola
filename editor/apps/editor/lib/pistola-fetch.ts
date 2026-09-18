import { pistolaApiUrl, pistolaRemoteInit } from '../../../packages/editor/src/lib/api-base'

export const pistolaFetch = (pathname: string, init?: RequestInit) =>
  fetch(pistolaApiUrl(pathname), pistolaRemoteInit(init))

export const pistolaEventSource = (pathname: string) =>
  new EventSource(pistolaApiUrl(pathname), {
    withCredentials: Boolean(process.env.NEXT_PUBLIC_PISTOLA_API_BASE),
  })
