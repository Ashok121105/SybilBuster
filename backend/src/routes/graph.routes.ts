import { Router } from 'express'
import { getApplicationGraph } from '../controllers/graph.controller.js'

export const graphRouter = Router()
graphRouter.get('/:applicationId', getApplicationGraph)