import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import { ContactStatus } from '@prisma/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  switch (req.method) {
    case 'GET':
      return getContacts(req, res, user.id);
    case 'POST':
      return createContact(req, res, user.id);
    case 'PUT':
      return updateContact(req, res, user.id);
    case 'DELETE':
      return deleteContact(req, res, user.id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function getContacts(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { status, search } = req.query;

    const where: any = { userId };

    if (status && typeof status === 'string' && Object.values(ContactStatus).includes(status as ContactStatus)) {
      where.status = status as ContactStatus;
    }

    if (search && typeof search === 'string') {
      where.OR = [
        { igUsername: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
        { niche: { contains: search, mode: 'insensitive' } },
      ];
    }

    const contacts = await prisma.contact.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { outreachMessages: true } },
      },
    });

    return res.status(200).json(contacts);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return res.status(500).json({ error: 'Failed to fetch contacts' });
  }
}

async function createContact(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { igUsername, displayName, niche, location, followerCount, engagementRate, bio, notes, status } = req.body;

    if (!igUsername) {
      return res.status(400).json({ error: 'igUsername is required' });
    }

    const normalizedUsername = igUsername.replace(/^@/, '').toLowerCase();

    const existing = await prisma.contact.findUnique({
      where: { userId_igUsername: { userId, igUsername: normalizedUsername } },
    });

    if (existing) {
      return res.status(409).json({ error: 'Contact with this username already exists' });
    }

    const contact = await prisma.contact.create({
      data: {
        userId,
        igUsername: normalizedUsername,
        ...(displayName !== undefined && { displayName }),
        ...(niche !== undefined && { niche }),
        ...(location !== undefined && { location }),
        ...(followerCount !== undefined && { followerCount }),
        ...(engagementRate !== undefined && { engagementRate }),
        ...(bio !== undefined && { bio }),
        ...(notes !== undefined && { notes }),
        ...(status !== undefined && { status }),
      },
    });

    return res.status(201).json(contact);
  } catch (error) {
    console.error('Error creating contact:', error);
    return res.status(500).json({ error: 'Failed to create contact' });
  }
}

async function updateContact(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { id, igUsername, displayName, niche, location, followerCount, engagementRate, bio, notes, status, lastContactedAt } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    const existing = await prisma.contact.findFirst({ where: { id, userId } });
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const contact = await prisma.contact.update({
      where: { id },
      data: {
        ...(igUsername !== undefined && { igUsername: igUsername.replace(/^@/, '').toLowerCase() }),
        ...(displayName !== undefined && { displayName }),
        ...(niche !== undefined && { niche }),
        ...(location !== undefined && { location }),
        ...(followerCount !== undefined && { followerCount }),
        ...(engagementRate !== undefined && { engagementRate }),
        ...(bio !== undefined && { bio }),
        ...(notes !== undefined && { notes }),
        ...(status !== undefined && { status }),
        ...(lastContactedAt !== undefined && { lastContactedAt: lastContactedAt ? new Date(lastContactedAt) : null }),
      },
    });

    return res.status(200).json(contact);
  } catch (error) {
    console.error('Error updating contact:', error);
    return res.status(500).json({ error: 'Failed to update contact' });
  }
}

async function deleteContact(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    const existing = await prisma.contact.findFirst({ where: { id, userId } });
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    await prisma.contact.delete({ where: { id } });
    return res.status(204).send(null);
  } catch (error) {
    console.error('Error deleting contact:', error);
    return res.status(500).json({ error: 'Failed to delete contact' });
  }
}
