import { motion } from 'framer-motion';
import { Leaf, Megaphone, Users, Store, Truck, Package, Tag, MonitorPlay, Briefcase } from 'lucide-react';

// Hub-and-spoke view of the functional areas RetailIQ unifies.
const AREAS = [
  { label: 'Marketing', icon: Megaphone },
  { label: 'Shoppers', icon: Users },
  { label: 'Stores', icon: Store },
  { label: 'Supply Chain', icon: Truck },
  { label: 'Inventory', icon: Package },
  { label: 'Products', icon: Tag },
  { label: 'Retail Media', icon: MonitorPlay },
  { label: 'Partners', icon: Briefcase },
];

const SIZE = 360;
const C = SIZE / 2;
const R = 140;

export default function HubDiagram() {
  const nodes = AREAS.map((a, i) => {
    const angle = (i / AREAS.length) * 2 * Math.PI - Math.PI / 2;
    return { ...a, x: C + R * Math.cos(angle), y: C + R * Math.sin(angle) };
  });

  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="absolute inset-0">
        <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(148,163,184,0.12)" strokeDasharray="3 6" />
        {nodes.map((n, i) => (
          <g key={n.label}>
            <motion.line
              x1={C} y1={C} x2={n.x} y2={n.y}
              stroke="rgba(74,222,128,0.35)" strokeWidth="1.5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.6, delay: 0.3 + i * 0.08 }}
            />
            {/* data pulse travelling from each area into the hub */}
            <motion.circle
              r="3" fill="#4ade80"
              initial={{ cx: n.x, cy: n.y, opacity: 0 }}
              animate={{ cx: [n.x, C], cy: [n.y, C], opacity: [0, 1, 0] }}
              transition={{ duration: 2.2, delay: 1 + i * 0.35, repeat: Infinity, repeatDelay: 1.6 }}
            />
            {/* insight pulse travelling from the hub back out to each area */}
            <motion.circle
              r="3" fill="#67e8f9"
              initial={{ cx: C, cy: C, opacity: 0 }}
              animate={{ cx: [C, n.x], cy: [C, n.y], opacity: [0, 1, 0] }}
              transition={{ duration: 2.2, delay: 2.9 + i * 0.35, repeat: Infinity, repeatDelay: 1.6 }}
            />
          </g>
        ))}
      </svg>

      {nodes.map(({ label, icon: Icon, x, y }, i) => (
        // The top node's spoke runs downward, so its label sits above the icon instead.
        <div key={label} className="absolute" style={{ left: x, top: y, transform: i === 0 ? 'translate(-50%, calc(-100% + 22px))' : 'translate(-50%, -22px)' }}>
        <motion.div
          className={`flex ${i === 0 ? 'flex-col-reverse' : 'flex-col'} items-center gap-1.5`}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, delay: 0.5 + i * 0.08 }}
        >
          <div className="w-11 h-11 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-center shadow-lg">
            <Icon className="w-5 h-5 text-cyan-300" />
          </div>
          <span className="text-xs font-medium text-slate-300 whitespace-nowrap">{label}</span>
        </motion.div>
        </div>
      ))}

      <div className="absolute" style={{ left: C, top: C, transform: 'translate(-50%, -40px)' }}>
      <motion.div
        className="flex flex-col items-center"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-retail-400 to-retail-600 flex flex-col items-center justify-center gap-1 shadow-2xl shadow-retail-500/40 ring-4 ring-retail-500/20">
          <Leaf className="w-8 h-8 text-white" />
          <span className="font-display font-bold text-white text-[11px] leading-none">RetailIQ</span>
        </div>
      </motion.div>
      </div>
    </div>
  );
}
