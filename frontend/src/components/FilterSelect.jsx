import { memo } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Memoized filter select component for analytics pages.
 * Prevents unnecessary re-renders when parent state changes (e.g., results loading).
 * 
 * @param {Object} props
 * @param {string} props.value - Current selected value
 * @param {function} props.onChange - Change handler
 * @param {Array} props.options - Array of option values (strings)
 * @param {boolean} props.loading - Whether options are still loading
 * @param {string} props.colorClass - Tailwind color class (e.g., 'cyan', 'purple', 'orange')
 * @param {string} props.placeholder - Placeholder text when loading
 * @param {React.ReactNode} props.icon - Optional icon component
 * @param {string} props.label - Optional label before the select
 */
const FilterSelect = memo(function FilterSelect({
  value,
  onChange,
  options = [],
  loading = false,
  colorClass = 'cyan',
  placeholder = 'Loading...',
  icon: Icon,
  label
}) {
  // Color mappings for border and text
  const colorMap = {
    cyan: { border: 'border-cyan-400', text: 'text-cyan-300' },
    purple: { border: 'border-purple-400', text: 'text-purple-300' },
    orange: { border: 'border-orange-400', text: 'text-orange-300' },
    pink: { border: 'border-pink-400', text: 'text-pink-300' },
    amber: { border: 'border-amber-400', text: 'text-amber-300' },
    retail: { border: 'border-retail-400', text: 'text-retail-300' },
    blue: { border: 'border-blue-400', text: 'text-blue-300' },
    green: { border: 'border-green-400', text: 'text-green-300' },
  };
  
  const colors = colorMap[colorClass] || colorMap.cyan;
  
  if (loading) {
    return (
      <>
        {Icon && <Icon className="w-5 h-5 text-slate-500" />}
        {label && <span>{label}</span>}
        <span className={`inline-flex items-center gap-2 px-3 py-1 ${colors.text} border-b-2 ${colors.border}`}>
          <Loader2 className="w-4 h-4 animate-spin" />
          {placeholder}
        </span>
      </>
    );
  }
  
  return (
    <>
      {Icon && <Icon className="w-5 h-5 text-slate-500" />}
      {label && <span>{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`madlib-select bg-transparent border-b-2 ${colors.border} px-3 py-1 ${colors.text} font-medium cursor-pointer focus:outline-none`}
      >
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </>
  );
});

export default FilterSelect;

