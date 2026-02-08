import express, { type Router, type Request, type Response } from 'express';
import { prisma } from '@/prismaClient.js';
import { Prisma } from '@prisma/client';

const router: Router = express.Router();

interface PartnerBinding {
  code: string;
  short_name: string;
  full_name: string;
}

/**
 * GET /api/partners
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { type, short_name, full_name, code } = req.query;
  
  const where: Prisma.PartnerWhereInput = {};
  
  if (type !== undefined) {
    where.type = parseInt(type as string);
  }
  if (short_name) {
    where.short_name = { contains: short_name as string };
  }
  if (full_name) {
    where.full_name = { contains: full_name as string };
  }
  if (code) {
    where.code = { contains: code as string };
  }
  
  try {
    const rows = await prisma.partner.findMany({
      where,
      orderBy: { short_name: 'asc' }
    });
    
    // Rows are already in snake_case
    
    res.json({ data: rows });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/partners
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { code, short_name, full_name, address, contact_person, contact_phone, type } = req.body;
  
  try {
    await prisma.partner.create({
      data: {
        code,
        short_name,
        full_name,
        address,
        contact_person,
        contact_phone,
        type
      }
    });
    res.json({ short_name, message: 'Customer/Supplier created!' });
  } catch (err) {
    const error = err as Error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(400).json({ error: 'The customer/supplier code or abbreviation already exists' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * PUT /api/partners/:short_name
 */
router.put('/:short_name', async (req: Request, res: Response): Promise<void> => {
  const short_name = req.params['short_name'] as string;
  const { code, full_name, address, contact_person, contact_phone, type } = req.body;
  
  try {
    await prisma.partner.update({
      where: { short_name: short_name },
      data: {
        code,
        full_name,
        address,
        contact_person,
        contact_phone,
        type
      }
    });
    
    res.json({ message: 'Customer/Supplier updated!' });
  } catch (err) {
    const error = err as Error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
       res.status(404).json({ error: 'Customer/Supplier does not exist' });
       return;
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/partners/:short_name
 */
router.delete('/:short_name', async (req: Request, res: Response): Promise<void> => {
  const short_name = req.params['short_name'] as string;
  
  try {
    await prisma.partner.delete({
       where: { short_name: short_name }
    });
    
    res.json({ message: 'Customer/Supplier deleted!' });
  } catch (err) {
    const error = err as Error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
       res.status(404).json({ error: 'Customer/Supplier does not exist' });
       return;
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/partners/bindings
 */
router.post('/bindings', async (req: Request, res: Response): Promise<void> => {
  const rawBody = req.body;
  const bindings: PartnerBinding[] = Array.isArray(rawBody) ? rawBody : [rawBody];
  
  if (!bindings.length) {
    res.status(400).json({ error: 'No binding data' });
    return;
  }
  
  const codes = new Set<string>();
  const shorts = new Set<string>();
  const fulls = new Set<string>();
  
  for (const b of bindings) {
    if (!b.code || !b.short_name || !b.full_name) {
      res.status(400).json({ error: 'None of the three can be empty' });
      return;
    }
    if (codes.has(b.code) || shorts.has(b.short_name) || fulls.has(b.full_name)) {
      res.status(400).json({ error: 'Duplicated batch data' });
      return;
    }
    codes.add(b.code);
    shorts.add(b.short_name);
    fulls.add(b.full_name);
  }

  const bCodes = Array.from(codes);
  const bShorts = Array.from(shorts);
  const bFulls = Array.from(fulls);
  
  try {
    // Check conflicts
    // SQL: SELECT ... WHERE code IN ... OR short_name IN ... OR full_name IN ...
    const conflicts = await prisma.partner.findMany({
       where: {
         OR: [
           { code: { in: bCodes } },
           { short_name: { in: bShorts } },
           { full_name: { in: bFulls } }
         ]
       },
       select: {
         code: true,
         short_name: true,
         full_name: true
       }
    });
    
    if (conflicts.length > 0) {
      res.status(400).json({ error: 'Conflicts with existing data', conflicts });
      return;
    }
    
    // Batch Insert
    await prisma.$transaction(
        bindings.map(b => 
            prisma.partner.create({
                data: {
                    code: b.code,
                    short_name: b.short_name,
                    full_name: b.full_name,
                    // defaults
                    type: 0 
                }
            })
        )
    );
    
    res.json({ message: 'Binded' });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

export default router;
