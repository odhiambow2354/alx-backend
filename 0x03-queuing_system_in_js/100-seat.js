const express = require('express');
const redis = require('redis');
const { promisify } = require('util');
const kue = require('kue');

const app = express();
const client = redis.createClient();
const getAsync = promisify(client.get).bind(client);
const reserveAsync = promisify(client.set).bind(client);

const queue = kue.createQueue();

// Set initial number of available seats to 50
reserveAsync('available_seats', 50);

// Initialize reservationEnabled to true
let reservationEnabled = true;

// Function to reserve seats
const reserveSeat = async (number) => {
    try {
        await reserveAsync('available_seats', number);
    } catch (error) {
        throw new Error('Failed to reserve seat');
    }
};

// Function to get current available seats
const getCurrentAvailableSeats = async () => {
    try {
        const seats = await getAsync('available_seats');
        return parseInt(seats);
    } catch (error) {
        throw new Error('Failed to get available seats');
    }
};

// Middleware to handle reservation blocking
const reservationMiddleware = (req, res, next) => {
    if (!reservationEnabled) {
        return res.status(400).json({ status: 'Reservation are blocked' });
    }
    next();
};

// Route to get current available seats
app.get('/available_seats', async (req, res) => {
    try {
        const numberOfAvailableSeats = await getCurrentAvailableSeats();
        res.json({ numberOfAvailableSeats });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to reserve a seat
app.get('/reserve_seat', reservationMiddleware, async (req, res) => {
    try {
        const job = queue.create('reserve_seat').save();
        job.on('complete', () => {
            console.log(`Seat reservation job ${job.id} completed`);
        });
        job.on('failed', (err) => {
            console.log(`Seat reservation job ${job.id} failed: ${err}`);
        });
        res.json({ status: 'Reservation in process' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to process queue and decrease available seats
app.get('/process', async (req, res) => {
    try {
        res.json({ status: 'Queue processing' });
        queue.process('reserve_seat', async (job, done) => {
            const availableSeats = await getCurrentAvailableSeats();
            if (availableSeats === 0) {
                reservationEnabled = false;
            }
            if (availableSeats >= 0) {
                try {
                    await reserveSeat(1);
                    done();
                } catch (error) {
                    done(new Error('Not enough seats available'));
                }
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start the server
const PORT = 1245;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
