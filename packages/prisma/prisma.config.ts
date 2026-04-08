import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
    schema: 'src/schema.prisma',
    migrations: {
        path: 'src/migrations'
    },
    datasource: {
        url: process.env.DATABASE_URL!
    }
});
