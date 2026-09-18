const getPistolaApiBase = () =>
  process.env.NEXT_PUBLIC_PISTOLA_API_BASE?.trim().replace(/\/+$/, '') || ''

export const pistolaApiUrl = (pathname: string) => `${getPistolaApiBase()}${pathname}`

export const pistolaRemoteInit = (init: RequestInit = {}): RequestInit =>
  getPistolaApiBase()
    ? {
        ...init,
        credentials: 'include',
      }
    : init
