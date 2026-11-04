import { NAV } from './nav'

/** Which module a route belongs to; this name selects the accent colour through [data-module] in index.css. */
export const moduleForPath = (pathname) => {
  if (pathname === '/') return 'dashboard'
  const item = NAV.find((n) => n.to !== '/' && pathname.startsWith(n.to))
  return item?.module ?? 'dashboard'
}
export const navItemForPath = (pathname) => NAV.find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)))
