import 'server-only'

import { randomUUID } from 'node:crypto'
import postgres from 'postgres'

import { getAuthConfig } from './config'

export type AuthUserRecord = {
  id: string
  email: string
  password_hash: string
  created_at: string | Date
}

type AuthSessionJoinRecord = {
  session_id: string
  user_id: string
  email: string
  password_hash: string
  expires_at: string | Date
}

declare global {
  // eslint-disable-next-line no-var
  var __pistolaAuthSql: ReturnType<typeof postgres> | undefined
  // eslint-disable-next-line no-var
  var __pistolaAuthSchemaReady: Promise<void> | undefined
}

const getSql = () => {
  if (!globalThis.__pistolaAuthSql) {
    globalThis.__pistolaAuthSql = postgres(getAuthConfig().postgresUrl, {
      idle_timeout: 5,
      max: 1,
      prepare: false,
    })
  }

  return globalThis.__pistolaAuthSql
}

const ensureAuthSchema = async () => {
  if (!globalThis.__pistolaAuthSchemaReady) {
    globalThis.__pistolaAuthSchemaReady = (async () => {
      const sql = getSql()

      await sql`
        create table if not exists pistola_auth_users (
          id text primary key,
          email text not null unique,
          password_hash text not null,
          created_at timestamptz not null default now()
        )
      `

      await sql`
        create table if not exists pistola_auth_sessions (
          id text primary key,
          user_id text not null references pistola_auth_users(id) on delete cascade,
          token_hash text not null unique,
          expires_at timestamptz not null,
          created_at timestamptz not null default now()
        )
      `

      await sql`
        create index if not exists pistola_auth_sessions_user_id_idx
        on pistola_auth_sessions (user_id)
      `

      await sql`
        create index if not exists pistola_auth_sessions_expires_at_idx
        on pistola_auth_sessions (expires_at)
      `
    })().catch((error) => {
      globalThis.__pistolaAuthSchemaReady = undefined
      throw error
    })
  }

  await globalThis.__pistolaAuthSchemaReady
}

export const createAuthUser = async (email: string, passwordHash: string) => {
  await ensureAuthSchema()
  const sql = getSql()
  const id = randomUUID()

  const rows = await sql<AuthUserRecord[]>`
    insert into pistola_auth_users (id, email, password_hash)
    values (${id}, ${email}, ${passwordHash})
    returning id, email, password_hash, created_at
  `

  return rows[0] ?? null
}

export const getAuthUserByEmail = async (email: string) => {
  await ensureAuthSchema()
  const sql = getSql()

  const rows = await sql<AuthUserRecord[]>`
    select id, email, password_hash, created_at
    from pistola_auth_users
    where email = ${email}
    limit 1
  `

  return rows[0] ?? null
}

export const createAuthSessionRecord = async (
  userId: string,
  tokenHash: string,
  expiresAt: Date,
) => {
  await ensureAuthSchema()
  const sql = getSql()
  const sessionId = randomUUID()

  await sql`
    insert into pistola_auth_sessions (id, user_id, token_hash, expires_at)
    values (${sessionId}, ${userId}, ${tokenHash}, ${expiresAt.toISOString()})
  `

  return {
    sessionId,
    expiresAt,
  }
}

export const getAuthSessionByTokenHash = async (tokenHash: string) => {
  await ensureAuthSchema()
  const sql = getSql()

  const rows = await sql<AuthSessionJoinRecord[]>`
    select
      s.id as session_id,
      u.id as user_id,
      u.email as email,
      u.password_hash as password_hash,
      s.expires_at as expires_at
    from pistola_auth_sessions s
    inner join pistola_auth_users u on u.id = s.user_id
    where s.token_hash = ${tokenHash}
    limit 1
  `

  return rows[0] ?? null
}

export const deleteAuthSessionByTokenHash = async (tokenHash: string) => {
  await ensureAuthSchema()
  const sql = getSql()

  await sql`
    delete from pistola_auth_sessions
    where token_hash = ${tokenHash}
  `
}

export const deleteExpiredAuthSessions = async () => {
  await ensureAuthSchema()
  const sql = getSql()

  await sql`
    delete from pistola_auth_sessions
    where expires_at < now()
  `
}
