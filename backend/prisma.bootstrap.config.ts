import { defineConfig } from 'prisma/config';

// Prisma migrate diff requires a datasource URL but does not connect for an empty-to-schema diff.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: 'postgresql://schema_generator:schema_generator@127.0.0.1:5432/schema_generator?schema=public'
  }
});
