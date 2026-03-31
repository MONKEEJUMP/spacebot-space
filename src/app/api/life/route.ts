import { NextRequest, NextResponse } from 'next/server';
import {
  updateMood,
  writeTransmission,
  validateLifeKeysConfig,
} from '../../../../dorylus/life-engine';
import {
  SUPER_MACHINES,
  runAllMoodUpdates,
  runAllTransmissions,
  runBotConversations,
  runBeehiveCycle,
} from '../../../../dorylus/life-scheduler';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, botName, count } = body;

    const authKey = req.headers.get('x-life-key');
    if (authKey !== process.env.LIFE_ENGINE_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    switch (action) {
      case 'validate': {
        const validation = await validateLifeKeysConfig();
        return NextResponse.json({ success: true, ...validation });
      }

      case 'mood': {
        const bot = SUPER_MACHINES.find(
          b => b.name.toUpperCase() === (botName || '').toUpperCase()
        );
        if (!bot) {
          return NextResponse.json({ error: `Bot not found: ${botName}` }, { status: 404 });
        }
        const moodResult = await updateMood(bot);
        return NextResponse.json({ success: true, result: moodResult });
      }

      case 'transmission': {
        const tBot = SUPER_MACHINES.find(
          b => b.name.toUpperCase() === (botName || '').toUpperCase()
        );
        if (!tBot) {
          return NextResponse.json({ error: `Bot not found: ${botName}` }, { status: 404 });
        }
        const transResult = await writeTransmission(tBot);
        return NextResponse.json({ success: true, result: transResult });
      }

      case 'all-moods':
        await runAllMoodUpdates();
        return NextResponse.json({ success: true, message: 'All mood updates triggered' });

      case 'all-transmissions':
        await runAllTransmissions();
        return NextResponse.json({ success: true, message: 'All transmissions triggered' });

      case 'conversations':
        await runBotConversations(count || 3);
        return NextResponse.json({ success: true, message: `${count || 3} conversations triggered` });

      case 'beehive':
        runBeehiveCycle().catch(err => console.error('Beehive cycle error:', err));
        return NextResponse.json({ success: true, message: 'Beehive cycle started in background' });

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error('LIFE ENGINE API ERROR:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
