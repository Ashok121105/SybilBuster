import { graphService } from '../services/graphRuntime.service.js'

try {
  const imported = await graphService.initialize()
  if (!imported) {
    throw new Error('Neo4j is not configured or reachable; the synthetic relationship import was not performed.')
  }
  console.info('Synthetic relationship import completed.')
} finally {
  await graphService.close()
}