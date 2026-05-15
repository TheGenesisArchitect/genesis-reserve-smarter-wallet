import { logger } from '../config/logger';
import { startReconciliationCron } from './reconciliation.service';

startReconciliationCron()
    .then(() => {
        logger.info('Reconciliation service started');
    })
    .catch((err) => {
        logger.error({ err }, 'Failed to start reconciliation service');
        process.exit(1);
    });
