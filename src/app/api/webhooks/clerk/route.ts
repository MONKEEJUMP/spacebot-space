import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const eventType = payload.type;

    if (eventType === 'user.created' || eventType === 'user.updated') {
      const userData = payload.data;
      const email = userData.email_addresses?.[0]?.email_address || '';
      const firstName = userData.first_name || '';
      const lastName = userData.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim() || email.split('@')[0];
      const clerkId = userData.id;

      console.log(`[Clerk Webhook] ${eventType}: ${fullName} (${email}) clerkId=${clerkId}`);

      // TODO: Implement Prisma sync when Users table is ready
      // await prisma.users.upsert({
      //   where: { clerkId },
      //   update: { email, name: fullName },
      //   create: { clerkId, email, name: fullName, tier: 'resident' },
      // });
    }

    if (eventType === 'user.deleted') {
      const clerkId = payload.data.id;
      console.log(`[Clerk Webhook] user.deleted: clerkId=${clerkId}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Clerk Webhook] Error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
