import { logger } from '../config/logger';
import { EventBus } from '../config/eventbus';

async function start() {
    const bus = await EventBus.getInstance();

    await bus.subscribe('*', async (event) => {
        logger.debug(
            {
                eventType: event.eventType,
                aggregateId: event.aggregateId,
                eventId: event.eventId,
            },
            'Event processor received event'
        );
    });

    logger.info('Event processor started');
}

start().catch((err) => {
    logger.error({ err }, 'Failed to start event processor');
    process.exit(1);
});
