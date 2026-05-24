import { Notification, UserNotification } from '../../models/index.js';

class NotificationInboxService {
    async enrichInboxRows(userNotifications) {
        if (!userNotifications.length) return [];

        const notificationIds = [...new Set(userNotifications.map((row) => row.notificationId))];
        const notifications = await Notification.find({ id: { $in: notificationIds } }).lean();
        const notificationMap = Object.fromEntries(notifications.map((n) => [n.id, n]));

        return userNotifications.map((row) => {
            const notification = notificationMap[row.notificationId] || {};
            return {
                id: row.id,
                notificationId: row.notificationId,
                title: notification.title || '',
                message: notification.message || '',
                url: notification.url || null,
                isRead: row.isRead,
                readAt: row.readAt,
                createdAt: row.createdAt,
            };
        });
    }

    async getUserNotifications(userId, { page = 1, limit = 30 } = {}) {
        const skip = (Math.max(1, page) - 1) * limit;

        const [rows, total, unreadCount] = await Promise.all([
            UserNotification.find({ userId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            UserNotification.countDocuments({ userId }),
            UserNotification.countDocuments({ userId, isRead: false }),
        ]);

        const notifications = await this.enrichInboxRows(rows);

        return {
            notifications,
            unreadCount,
            total,
            page: Math.max(1, page),
            limit,
            totalPages: Math.ceil(total / limit) || 1,
        };
    }

    async getUserNotificationById(userId, inboxId) {
        const row = await UserNotification.findOne({ id: inboxId, userId }).lean();
        if (!row) return null;

        const [enriched] = await this.enrichInboxRows([row]);
        return enriched;
    }

    async getUserNotificationByNotificationId(userId, notificationId) {
        const row = await UserNotification.findOne({ userId, notificationId }).lean();
        if (!row) return null;

        const [enriched] = await this.enrichInboxRows([row]);
        return enriched;
    }

    async getPlanUpdateRows(userId, plan) {
        const rows = await UserNotification.find({ userId })
            .sort({ createdAt: -1 })
            .lean();

        if (!rows.length) return [];

        const notificationIds = [...new Set(rows.map((row) => row.notificationId))];
        const notifications = await Notification.find({
            id: { $in: notificationIds },
            isPlanSpecific: true,
            plan,
        }).sort({ createdAt: -1 }).lean();
        const rowMap = Object.fromEntries(rows.map((row) => [row.notificationId, row]));

        return notifications.map((notification) => {
            const row = rowMap[notification.id] || {};
            return {
                id: row.id,
                notificationId: notification.id,
                title: notification.title,
                message: notification.message,
                description: notification.message,
                url: notification.url || null,
                date: notification.createdAt,
                createdAt: row.createdAt || notification.createdAt,
                type: 'notification',
                link: notification.url || undefined,
                isRead: !!row.isRead,
                readAt: row.readAt || null,
            };
        });
    }

    async getPlanUpdates(userId, plan) {
        const updates = await this.getPlanUpdateRows(userId, plan);
        return {
            updates,
            unreadCount: updates.filter((update) => !update.isRead).length,
        };
    }

    async markPlanUpdatesAsRead(userId, plan) {
        const updates = await this.getPlanUpdateRows(userId, plan);
        const inboxIds = updates.map((update) => update.id).filter(Boolean);

        if (inboxIds.length) {
            await UserNotification.updateMany(
                { userId, id: { $in: inboxIds }, isRead: false },
                { isRead: true, readAt: new Date() }
            );
        }

        return { success: true, unreadCount: 0 };
    }

    async markAsRead(userId, inboxId) {
        const row = await UserNotification.findOneAndUpdate(
            { id: inboxId, userId },
            { isRead: true, readAt: new Date() },
            { new: true }
        ).lean();

        if (!row) return null;

        const unreadCount = await UserNotification.countDocuments({ userId, isRead: false });
        return { success: true, unreadCount };
    }

    async markAllAsRead(userId) {
        await UserNotification.updateMany(
            { userId, isRead: false },
            { isRead: true, readAt: new Date() }
        );

        return { success: true, unreadCount: 0 };
    }
}

export default new NotificationInboxService();
