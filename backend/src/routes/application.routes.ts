import { Router } from 'express'
import { createApplication, listApplications } from '../controllers/application.controller.js'
import { analyzeRisk, investigateApplication, simulateRisk } from '../controllers/risk.controller.js'

export const applicationRouter = Router()
export const riskRouter = Router()

applicationRouter.get('/', listApplications)
applicationRouter.post('/', createApplication)
riskRouter.post('/analyze', analyzeRisk)
riskRouter.post('/investigate', investigateApplication)
riskRouter.post('/simulate', simulateRisk)