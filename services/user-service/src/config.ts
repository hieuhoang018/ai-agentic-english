import { getEnv, getEnvBool, getEnvInt } from "@ai-agentic-english/shared"

export const config = {
  port: getEnvInt("PORT", 4001),
  databaseUrl: getEnv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/user_service",
  ),
  clerkWebhookSecret: process.env.CLERK_WEBHOOK_SECRET,
  stubClerkWebhook: getEnvBool("STUB_CLERK_WEBHOOK", true),
}
