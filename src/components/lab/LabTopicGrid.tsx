import type { LabBotDefinition } from '@/types/lab';
import LabTopicCard from './LabTopicCard';

interface LabTopicGridProps {
  bots: readonly LabBotDefinition[];
  isMyspace?: boolean;
}

export default function LabTopicGrid({ bots, isMyspace }: Readonly<LabTopicGridProps>) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {bots.map((bot) => (
        <LabTopicCard key={bot.slug} bot={bot} isMyspace={isMyspace} />
      ))}
    </div>
  );
}
