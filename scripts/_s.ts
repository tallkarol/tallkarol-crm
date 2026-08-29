import { loadLocalEnv } from "@/lib/load-env"
loadLocalEnv()
import { db } from "@/db"
import { sessions, users } from "@/db/schema"
import { hashToken, newToken, SESSION_TTL_MS } from "@/lib/crypto"
async function m(){const [u]=await db.select().from(users).limit(1);const t=newToken()
await db.insert(sessions).values({userId:u.id,tokenHash:hashToken(t),expiresAt:new Date(Date.now()+SESSION_TTL_MS)})
console.log(t);process.exit(0)}
m()
