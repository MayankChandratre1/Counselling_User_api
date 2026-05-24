import NotificationInboxService from '../services/mongo/notification.service.js';

class NotificationController {
    async getNotifications(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const page = parseInt(req.query.page, 10) || 1;
            const limit = parseInt(req.query.limit, 10) || 30;
            const result = await NotificationInboxService.getUserNotifications(userId, { page, limit });
            res.status(200).json({ success: true, ...result });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getNotificationByBroadcastId(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const notification = await NotificationInboxService.getUserNotificationByNotificationId(
                userId,
                req.params.notificationId
            );

            if (!notification) {
                return res.status(404).json({ error: 'Notification not found' });
            }

            res.status(200).json({ success: true, notification });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getPlanUpdates(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const updates = await NotificationInboxService.getPlanUpdates(
                userId,
                decodeURIComponent(req.params.plan)
            );

            res.status(200).json({ success: true, updates });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async markPlanUpdatesAsRead(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const result = await NotificationInboxService.markPlanUpdatesAsRead(
                userId,
                decodeURIComponent(req.params.plan)
            );

            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getNotificationById(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const notification = await NotificationInboxService.getUserNotificationById(
                userId,
                req.params.id
            );

            if (!notification) {
                return res.status(404).json({ error: 'Notification not found' });
            }

            res.status(200).json({ success: true, notification });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async markAsRead(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const result = await NotificationInboxService.markAsRead(userId, req.params.id);
            if (!result) {
                return res.status(404).json({ error: 'Notification not found' });
            }

            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async markAllAsRead(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const result = await NotificationInboxService.markAllAsRead(userId);
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

export default new NotificationController();
