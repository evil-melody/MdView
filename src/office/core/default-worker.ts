import DocWorker from './worker/worker?worker&inline'
import { setDefaultWorker } from './worker/client'

setDefaultWorker(() => new DocWorker({ name: 'office-view' }))
