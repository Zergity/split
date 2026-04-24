import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { WeeklySpending, formatCurrency, formatNumber } from '../utils/balances';

interface Props {
  data: WeeklySpending[];
  currency: string;
  hasUser: boolean;
}

type Mode = 'group' | 'user';

const WEEK_WIDTH = 56;
const CHART_HEIGHT = 170;
const PAD_TOP = 28;
const PAD_BOTTOM = 28;
const PAD_X = 12;

function formatWeekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function WeeklySpendingChart({ data, currency, hasUser }: Props) {
  const [mode, setMode] = useState<Mode>('group');
  const [selected, setSelected] = useState<number>(data.length - 1);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep selection in range if data length changes.
  useEffect(() => {
    if (data.length === 0) return;
    if (selected < 0 || selected >= data.length) {
      setSelected(data.length - 1);
    }
  }, [data.length, selected]);

  // Scroll newest week into view. Use layout effect so the scroll happens
  // before paint and there's no visible jump.
  useLayoutEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [mode, data.length]);

  if (data.length === 0) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
        <p className="text-gray-400">No spending yet</p>
      </div>
    );
  }

  const effectiveMode: Mode = hasUser ? mode : 'group';
  const values = data.map((d) => (effectiveMode === 'group' ? d.groupTotal : d.userShare));
  const maxValue = Math.max(...values, 1);

  const innerHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const innerWidth = Math.max(data.length * WEEK_WIDTH, 280);
  const width = innerWidth + PAD_X * 2;

  const points = values.map((v, i) => ({
    x: PAD_X + i * WEEK_WIDTH + WEEK_WIDTH / 2,
    y: PAD_TOP + innerHeight * (1 - v / maxValue),
    value: v,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath =
    points.length > 0
      ? `${linePath} L${points[points.length - 1].x},${PAD_TOP + innerHeight} L${points[0].x},${PAD_TOP + innerHeight} Z`
      : '';

  const selectedWeek = data[selected] ?? data[data.length - 1];
  const selectedValue = effectiveMode === 'group' ? selectedWeek.groupTotal : selectedWeek.userShare;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Weekly spending</h3>
        {hasUser && (
          <div className="inline-flex rounded-md overflow-hidden border border-gray-700 text-sm">
            <button
              onClick={() => setMode('group')}
              className={`px-3 py-1 ${mode === 'group' ? 'bg-cyan-600 text-white' : 'bg-gray-900 text-gray-300 hover:bg-gray-700'}`}
            >
              Group
            </button>
            <button
              onClick={() => setMode('user')}
              className={`px-3 py-1 ${mode === 'user' ? 'bg-cyan-600 text-white' : 'bg-gray-900 text-gray-300 hover:bg-gray-700'}`}
            >
              You
            </button>
          </div>
        )}
      </div>

      <div ref={scrollRef} className="overflow-x-auto">
        <svg width={width} height={CHART_HEIGHT} className="block">
          <defs>
            <linearGradient id="weekly-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </linearGradient>
          </defs>
          {areaPath && <path d={areaPath} fill="url(#weekly-area)" />}
          <path d={linePath} stroke="#06b6d4" strokeWidth={2} fill="none" />
          {points.map((p, i) => (
            <g key={i} onClick={() => setSelected(i)} style={{ cursor: 'pointer' }}>
              {/* wider invisible hit target for touch */}
              <rect
                x={p.x - WEEK_WIDTH / 2}
                y={0}
                width={WEEK_WIDTH}
                height={CHART_HEIGHT}
                fill="transparent"
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={selected === i ? 5 : 3}
                fill={selected === i ? '#22d3ee' : '#0891b2'}
                stroke={selected === i ? '#fff' : 'none'}
                strokeWidth={selected === i ? 1.5 : 0}
              />
              {p.value > 0 && (
                <text
                  x={p.x}
                  y={p.y - 9}
                  textAnchor="middle"
                  fontSize={10}
                  fill={selected === i ? '#22d3ee' : '#9ca3af'}
                  fontWeight={selected === i ? 600 : 400}
                >
                  {formatNumber(p.value)}
                </text>
              )}
              <text
                x={p.x}
                y={CHART_HEIGHT - 8}
                textAnchor="middle"
                fontSize={10}
                fill={selected === i ? '#e5e7eb' : '#9ca3af'}
              >
                {formatWeekLabel(data[i].weekStart)}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="mt-2 text-sm text-gray-300">
        <span className="text-gray-500">Week of </span>
        <span className="font-medium">{formatWeekLabel(selectedWeek.weekStart)}</span>
        <span className="text-gray-500"> · </span>
        <span className="font-semibold text-cyan-300">{formatCurrency(selectedValue, currency)}</span>
      </div>
    </div>
  );
}
