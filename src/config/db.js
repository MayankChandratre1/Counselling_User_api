import mongoose from 'mongoose';

/** M0 Atlas allows ~500 connections total — cap pool per DO container. */
const MONGO_OPTIONS = {
    maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || '10', 10),
    minPoolSize: 0,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
};

let cached = global.mongoose;
if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
        throw new Error('MONGODB_URI is not defined');
    }

    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        cached.promise = mongoose
            .connect(mongoURI, MONGO_OPTIONS)
            .then((conn) => {
                console.log(`MongoDB Connected: ${conn.connection.host} (pool max ${MONGO_OPTIONS.maxPoolSize})`);
                mongoose.connection.on('disconnected', () => {
                    cached.conn = null;
                    cached.promise = null;
                });
                return conn;
            })
            .catch((error) => {
                cached.promise = null;
                console.error(`MongoDB connection error: ${error.message}`);
                throw error;
            });
    }

    cached.conn = await cached.promise;
    return cached.conn;
};

export default connectDB;
