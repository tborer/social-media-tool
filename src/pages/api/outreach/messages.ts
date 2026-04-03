import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  switch (req.method) {
    case 'GET':
      return getMessages(req, res, user.id);
    case 'POST':
      return createMessage(req, res, user.id);
    case 'PUT':
      return updateMessage(req, res, user.id);
    case 'DELETE':
      return deleteMessage(req, res, user.id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function getMessages(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { contactId, status } = req.query;

    const messages = await prisma.outreachMessage.findMany({
      where: {
        userId,
        ...(contactId && typeof contactId === 'string' && { contactId }),
        ...(status && typeof status === 'string' && { status: status as any }),
      },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
}

async function createMessage(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { contactId, messageBody, templateName, status } = req.body;

    if (!contactId || !messageBody) {
      return res.status(400).json({ error: 'contactId and messageBody are required' });
    }

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId },
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const message = await prisma.outreachMessage.create({
      data: {
        userId,
        contactId,
        messageBody,
        ...(templateName && { templateName }),
        ...(status && { status: status as any }),
      },
      include: { contact: true },
    });

    return res.status(201).json(message);
  } catch (error) {
    console.error('Error creating message:', error);
    return res.status(500).json({ error: 'Failed to create message' });
  }
}

async function updateMessage(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { id, messageBody, status, sentAt, responseReceivedAt, responseNotes } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    const existing = await prisma.outreachMessage.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const updateData: any = {};
    if (messageBody !== undefined) updateData.messageBody = messageBody;
    if (status !== undefined) updateData.status = status;
    if (sentAt !== undefined) updateData.sentAt = sentAt;
    if (responseReceivedAt !== undefined) updateData.responseReceivedAt = responseReceivedAt;
    if (responseNotes !== undefined) updateData.responseNotes = responseNotes;

    // Auto-set sentAt when status changes to SENT
    if (status === 'SENT' && existing.status !== 'SENT') {
      updateData.sentAt = new Date();
    }

    // Auto-set responseReceivedAt and update contact when status changes to REPLIED
    if (status === 'REPLIED' && existing.status !== 'REPLIED') {
      updateData.responseReceivedAt = new Date();
      await prisma.contact.update({
        where: { id: existing.contactId },
        data: { status: 'RESPONDED', lastContactedAt: new Date() },
      });
    }

    const message = await prisma.outreachMessage.update({
      where: { id },
      data: updateData,
      include: { contact: true },
    });

    return res.status(200).json(message);
  } catch (error) {
    console.error('Error updating message:', error);
    return res.status(500).json({ error: 'Failed to update message' });
  }
}

async function deleteMessage(req: NextApiRequest, res: NextApiResponse, userId: string) {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    const existing = await prisma.outreachMessage.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Message not found' });
    }

    await prisma.outreachMessage.delete({ where: { id } });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error deleting message:', error);
    return res.status(500).json({ error: 'Failed to delete message' });
  }
}
