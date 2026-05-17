/**
 * Category Badge — color-coded label for content categories.
 * Colors chosen for readability on dark backgrounds.
 */

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  Tech: { bg: '#4A9EFF20', text: '#4A9EFF' },
  Science: { bg: '#5200FF20', text: '#5200FF' },
  Politics: { bg: '#FF4A4A20', text: '#FF4A4A' },
  Business: { bg: '#FFD44A20', text: '#FFD44A' },
  Culture: { bg: '#8A4AFF20', text: '#8A4AFF' },
  Sports: { bg: '#FF660020', text: '#FF6600' },
  Philosophy: { bg: '#00D9D920', text: '#00D9D9' },
  Opinion: { bg: '#FF4A8D20', text: '#FF4A8D' },
  General: { bg: '#8888A020', text: '#8888A0' },
};

export default function CategoryBadge({
  category,
  className = '',
}: {
  category: string;
  className?: string;
}) {
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS.General;

  return (
    <span
      className={`inline-block px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${className}`}
      data-category={category.toLowerCase()}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.text}30`,
      }}
    >
      {category}
    </span>
  );
}
