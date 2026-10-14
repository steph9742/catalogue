// Jeton interne (en mémoire, par process) : autorise l'application d'une demande
// approuvée en rejouant la requête d'origine à travers les vrais handlers.
export const INTERNAL_TOKEN = crypto.randomUUID()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let appRef: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setApp = (a: any) => { appRef = a }
export const getApp = () => appRef
