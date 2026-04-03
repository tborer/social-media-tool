import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid contact ID' });
  }

  switch (req.method) {
    case 'GET':
      return getContact(res, id, user.id);
    case 'PUT':
      return updateContact(req, res, id, user.id);
    case 'DELETE':
      return deleteContact(res, id, user.id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function getContact(res: NextApiResponse, contactId: string, userId: string) {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId },
      include: { outreachMessages: { orderBy: { createdAt: 'desc' } } },
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    return res.status(200).json(contact);
  } catch (error) {
    console.error('Error fetching contact:', error);
    return res.status(500).json({ error: 'Failed to fetch contact' });
  }
}

async function updateContact(req: NextApiRequest, res: NextApiResponse, contactId: string, userId: string) {
  try {
    const existing = await prisma.contact.findFirst({ where: { id: contactId, userId } });
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const { igUsername, displayName, niche, location, followerCount, engagementRate, bio, notes, status, lastContactedAt } = req.body;

    const contact = await prisma.contact.update({
      where: { id: contactId },
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

async function deleteContact(res: NextApiResponse, contactId: string, userId: string) {
  try {
    const existing = await prisma.contact.findFirst({ where: { id: contactId, userId } });
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    await prisma.contact.delete({ where: { id: contactId } });
    return res.status(204).send(null);
  } catch (error) {
    console.error('Error deleting contact:', error);
    return res.status(500).json({ error: 'Failed to delete contact' });
  }
}
