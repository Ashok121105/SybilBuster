import { z } from 'zod'

const identifier = z.string().trim().min(1).max(128)
const applicantId = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/)

export const createApplicationSchema = z
  .object({
    applicantId,
    name: z.string().trim().min(1).max(160),
    loanAmount: z.number().finite().positive().max(1_000_000_000),
    income: z.number().finite().nonnegative().max(1_000_000_000),
    employmentLength: z.number().finite().nonnegative().max(100),
    deviceId: identifier,
    ipAddress: z.string().trim().ip(),
    upiId: identifier,
    bankAccountId: identifier,
  })
  .strict()

export const analyzeRiskSchema = z.object({ applicationId: z.string().uuid() }).strict()

export const simulateRiskSchema = z.object({
  applicationId: z.string().uuid(),
  signalType: z.enum([
    'SHARED_DEVICE',
    'SHARED_UPI',
    'SHARED_BANK',
    'SHARED_IP',
    'DEFAULT_HISTORY',
    'NETWORK_CONNECTION',
  ]),
}).strict()