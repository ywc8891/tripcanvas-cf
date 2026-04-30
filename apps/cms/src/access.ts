import type { Access, AccessArgs } from 'payload'

type User = {
  role?: 'admin' | 'editor'
  allowedMarkets?: string[]
}

export const isAdmin = (user?: User | null): boolean => {
  return user?.role === 'admin'
}

export const canAccessMarket = (user?: User | null, market?: string | null): boolean => {
  if (isAdmin(user)) return true
  if (!user || !user.allowedMarkets || !Array.isArray(user.allowedMarkets)) return false
  if (!market) return false
  return user.allowedMarkets.includes(market)
}

export const marketFilter = (user?: User | null) => {
  if (isAdmin(user)) return true
  if (!user || !user.allowedMarkets || user.allowedMarkets.length === 0) {
    return false
  }
  return {
    market: {
      in: user.allowedMarkets,
    },
  }
}
