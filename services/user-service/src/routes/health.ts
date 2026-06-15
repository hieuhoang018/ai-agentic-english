import { Router } from "express"
import { prisma } from "../db"

export const healthRouter = Router()

healthRouter.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: "ok", service: "user-service" })
  } catch {
    res.status(503).json({ status: "unavailable", service: "user-service" })
  }
})
