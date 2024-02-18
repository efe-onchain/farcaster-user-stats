import { pool } from '../db'; // Adjust the import path as needed
import redis from '../../utils/redis';

export async function GET(request) {
    const { searchParams } = new URL(request.url)
    const fid = searchParams.get('fid')
    const day = searchParams.get('day')

    const headers = new Headers();
    headers.set('Access-Control-Allow-Origin', '*');

    if (!fid) {
        return new Response.json({ error: 'Missing fid parameter' }, { headers });
    }
    if (!day) {
        return new Response.json({ error: 'Missing day parameter' }, { headers });
    }

    const fidBigInt = parseInt(fid, 10);
    if (isNaN(fidBigInt)) {
        return new Response.json({ error: 'Invalid fid parameter. Must be an integer.' }, { headers });
    }

    try {
        const cacheKey = `castactivity:${fid}`;
        let cachedData = await redis.get(cacheKey);
    
        if (cachedData) {
            return new Response.json(JSON.parse(cachedData), { headers });
        } else {
            const startTime = Date.now();
            const client = await pool.connect();
            const response = await pool.query(`
                WITH date_range AS (
                    SELECT NOW() - (n || ' days')::interval AS date
                    FROM generate_series(0, $2) AS n
                )
                SELECT DATE(date_range.date) AS date,
                    COUNT(casts.timestamp) AS castamount
                FROM date_range
                LEFT JOIN casts
                ON DATE(date_range.date) = DATE(casts.timestamp)
                AND casts.fid = $1
                GROUP BY DATE(date_range.date)
                ORDER BY DATE(date_range.date);`, [fidBigInt, day]);
            client.release();
            const data = response.rows;
            
            redis.set(cacheKey, JSON.stringify(data), 'EX', 7200); // 2 hours

            const endTime = Date.now();
            const timeInSeconds = (endTime - startTime) / 1000;
            console.log("CastActivity took", timeInSeconds, "seconds")

            return new Response.json(data, { headers });
        }
    } catch (error) {
        console.error('Error fetching active badge:', error);
        return new Response.json({ message: 'Internal server error', error: error }, { headers });
    }
};
