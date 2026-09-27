/**
 * Automation Framework Schema
 * 
 * Defines the complete registry of objects, metrics, operators, and actions
 * available for building automations. This schema enables:
 * - Users to build automations visually
 * - AI agents to parse descriptions and generate structured logic
 * - Developers to implement automation execution
 */

import { 
  Package, Users, Building, Megaphone, Tag, Cloud, Bell,
  Pause, Play, AlertTriangle, DollarSign, TrendingDown, TrendingUp,
  Mail, ListTodo, UserPlus, Clock, Percent, Hash, Calendar
} from 'lucide-react';

// ============== AUTOMATION OBJECTS ==============
// Each object represents an entity that can be monitored (metrics) or acted upon (actions)

export const AUTOMATION_OBJECTS = {
  // === PRODUCT ===
  product: {
    label: 'Product',
    icon: Package,
    description: 'Individual products or SKUs in the catalog',
    metrics: {
      days_on_hand: { 
        label: 'Days on Hand', 
        type: 'percentage', 
        unit: '%',
        description: 'Inventory level as percentage of target days on hand'
      },
      inventory_level: { 
        label: 'Inventory Level', 
        type: 'number', 
        unit: 'units',
        description: 'Current stock quantity in units'
      },
      unit_velocity: { 
        label: 'Unit Velocity', 
        type: 'number', 
        unit: 'units/week', 
        supportsTimeWindow: true,
        description: 'Average units sold per week'
      },
      price: { 
        label: 'Current Price', 
        type: 'currency', 
        unit: '$',
        description: 'Current selling price'
      },
      margin_percent: { 
        label: 'Margin %', 
        type: 'percentage', 
        unit: '%',
        description: 'Profit margin as percentage of price'
      },
    },
    actions: {
      pause_sales: { 
        label: 'Pause Sales', 
        params: [],
        description: 'Temporarily remove product from active sales'
      },
      resume_sales: { 
        label: 'Resume Sales', 
        params: [],
        description: 'Restore product to active sales'
      },
      flag_for_review: { 
        label: 'Flag for Review', 
        params: [
          { key: 'reason', label: 'Reason', type: 'text' }
        ],
        description: 'Mark product for manual review'
      },
      adjust_price: { 
        label: 'Adjust Price', 
        params: [
          { key: 'adjustment_type', label: 'Adjustment Type', type: 'select', options: ['percentage', 'fixed'] },
          { key: 'value', label: 'Value', type: 'number' }
        ],
        description: 'Change product price by percentage or fixed amount'
      },
    },
  },

  // === SHOPPER ===
  shopper: {
    label: 'Shopper',
    icon: Users,
    description: 'Individual customers and their behaviors',
    metrics: {
      days_since_purchase: { 
        label: 'Days Since Last Purchase', 
        type: 'number', 
        unit: 'days',
        description: 'Number of days since the shopper last made a purchase'
      },
      purchase_frequency: { 
        label: 'Avg Purchase Frequency', 
        type: 'number', 
        unit: 'days',
        description: 'Average days between purchases'
      },
      lifetime_value: { 
        label: 'Lifetime Value', 
        type: 'currency', 
        unit: '$',
        description: 'Total revenue from this shopper'
      },
      basket_size_avg: { 
        label: 'Avg Basket Size', 
        type: 'currency', 
        unit: '$',
        description: 'Average transaction value'
      },
    },
    actions: {
      send_promotion: { 
        label: 'Send Promotion', 
        params: [
          { key: 'discount_percent', label: 'Discount %', type: 'number', min: 1, max: 100 },
          { key: 'channel', label: 'Channel', type: 'select', options: ['email', 'sms', 'push', 'in_app'] },
          { key: 'message', label: 'Message', type: 'text', optional: true }
        ],
        description: 'Send a promotional offer to the shopper'
      },
      add_to_cohort: { 
        label: 'Add to Cohort', 
        params: [
          { key: 'cohort_id', label: 'Cohort', type: 'cohort_select' }
        ],
        description: 'Add shopper to a specific cohort for targeting'
      },
      send_notification: { 
        label: 'Send Notification', 
        params: [
          { key: 'channel', label: 'Channel', type: 'select', options: ['email', 'sms', 'push'] },
          { key: 'template', label: 'Template', type: 'select', options: ['reminder', 'announcement', 'alert'] }
        ],
        description: 'Send a notification to the shopper'
      },
    },
  },

  // === STORE ===
  store: {
    label: 'Store',
    icon: Building,
    description: 'Physical or virtual store locations',
    metrics: {
      staffing_level: { 
        label: 'Staffing Level', 
        type: 'percentage', 
        unit: '%',
        description: 'Current staff as percentage of optimal'
      },
      daily_sales: { 
        label: 'Daily Sales', 
        type: 'currency', 
        unit: '$',
        description: 'Total sales for the current day'
      },
      out_of_stock_count: { 
        label: 'Out of Stock SKUs', 
        type: 'number', 
        unit: 'items',
        description: 'Number of products currently out of stock'
      },
      foot_traffic: { 
        label: 'Foot Traffic', 
        type: 'number', 
        unit: 'visitors',
        description: 'Number of store visitors'
      },
    },
    actions: {
      adjust_pickup_estimate: { 
        label: 'Adjust Pickup Estimate', 
        params: [
          { key: 'add_minutes', label: 'Add Minutes', type: 'number', min: 0, max: 120 }
        ],
        description: 'Increase estimated pickup time'
      },
      adjust_delivery_estimate: { 
        label: 'Adjust Delivery Estimate', 
        params: [
          { key: 'add_minutes', label: 'Add Minutes', type: 'number', min: 0, max: 120 }
        ],
        description: 'Increase estimated delivery time'
      },
      send_manager_alert: { 
        label: 'Alert Store Manager', 
        params: [
          { key: 'message', label: 'Message', type: 'text' },
          { key: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high', 'urgent'] }
        ],
        description: 'Send an alert to the store manager'
      },
    },
  },

  // === CAMPAIGN ===
  campaign: {
    label: 'Campaign',
    icon: Megaphone,
    description: 'Marketing campaigns and sponsored listings',
    metrics: {
      impressions: { 
        label: 'Impressions', 
        type: 'number', 
        unit: '',
        description: 'Total ad impressions'
      },
      click_rate: { 
        label: 'Click Rate', 
        type: 'percentage', 
        unit: '%',
        description: 'Click-through rate'
      },
      spend: { 
        label: 'Spend', 
        type: 'currency', 
        unit: '$',
        description: 'Total campaign spend'
      },
      roas: { 
        label: 'ROAS', 
        type: 'number', 
        unit: 'x',
        description: 'Return on ad spend'
      },
    },
    actions: {
      pause: { 
        label: 'Pause Campaign', 
        params: [],
        description: 'Pause the campaign'
      },
      resume: { 
        label: 'Resume Campaign', 
        params: [],
        description: 'Resume a paused campaign'
      },
      adjust_budget: { 
        label: 'Adjust Budget', 
        params: [
          { key: 'adjustment_type', label: 'Adjustment Type', type: 'select', options: ['increase', 'decrease', 'set'] },
          { key: 'value', label: 'Value', type: 'number' }
        ],
        description: 'Change campaign budget'
      },
      create_sponsored_listing: { 
        label: 'Create Sponsored Listing', 
        params: [
          { key: 'budget', label: 'Budget ($)', type: 'number', min: 1 },
          { key: 'duration_days', label: 'Duration (days)', type: 'number', min: 1, max: 30 }
        ],
        description: 'Create a new sponsored listing campaign'
      },
    },
  },

  // === PROMOTION ===
  promotion: {
    label: 'Promotion',
    icon: Tag,
    description: 'Discounts, offers, and promotional campaigns',
    metrics: {
      redemption_rate: { 
        label: 'Redemption Rate', 
        type: 'percentage', 
        unit: '%',
        description: 'Percentage of promotions redeemed'
      },
      units_sold: { 
        label: 'Units Sold', 
        type: 'number', 
        unit: 'units',
        description: 'Units sold under this promotion'
      },
    },
    actions: {
      create: { 
        label: 'Create Promotion', 
        params: [
          { key: 'discount_percent', label: 'Discount %', type: 'number', min: 1, max: 100 },
          { key: 'duration_days', label: 'Duration (days)', type: 'number', min: 1, max: 90 },
          { key: 'promotion_type', label: 'Type', type: 'select', options: ['markdown', 'bogo', 'bundle', 'coupon'] }
        ],
        description: 'Create a new promotion'
      },
      extend: { 
        label: 'Extend Promotion', 
        params: [
          { key: 'additional_days', label: 'Additional Days', type: 'number', min: 1, max: 30 }
        ],
        description: 'Extend an existing promotion'
      },
      end_early: { 
        label: 'End Early', 
        params: [],
        description: 'End the promotion before scheduled end date'
      },
    },
  },

  // === CONTEXT (External Data) ===
  context: {
    label: 'Context',
    icon: Cloud,
    description: 'External factors like weather, holidays, and time',
    metrics: {
      weather_forecast_tomorrow: { 
        label: 'Weather Forecast (Tomorrow)', 
        type: 'select', 
        options: ['Sunny', 'Cloudy', 'Rain', 'Snow', 'Extreme Heat', 'Extreme Cold'],
        description: 'Predicted weather for tomorrow'
      },
      temperature_high: { 
        label: 'High Temperature', 
        type: 'number', 
        unit: '°F',
        description: 'Predicted high temperature'
      },
      is_holiday: { 
        label: 'Is Holiday', 
        type: 'boolean',
        description: 'Whether today is a holiday'
      },
      day_of_week: { 
        label: 'Day of Week', 
        type: 'select', 
        options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        description: 'Current day of the week'
      },
    },
    actions: {},  // Context has no actions, only used in conditions
  },

  // === NOTIFICATION ===
  notification: {
    label: 'Notification',
    icon: Bell,
    description: 'Alerts and notifications to various recipients',
    metrics: {},  // Notifications have no metrics, only actions
    actions: {
      send_alert: { 
        label: 'Send Alert', 
        params: [
          { key: 'recipient_type', label: 'Recipient', type: 'select', options: ['vendor', 'store_manager', 'buyer', 'operations_team', 'category_manager'] },
          { key: 'template', label: 'Template', type: 'select', options: ['low_velocity_alert', 'inventory_alert', 'performance_alert', 'general'] },
          { key: 'include_product_details', label: 'Include Product Details', type: 'boolean' }
        ],
        description: 'Send an alert to specified recipients'
      },
      send_email: { 
        label: 'Send Email', 
        params: [
          { key: 'recipient_email', label: 'Recipient Email', type: 'text' },
          { key: 'subject', label: 'Subject', type: 'text' },
          { key: 'body', label: 'Body', type: 'textarea' }
        ],
        description: 'Send a custom email'
      },
      create_task: { 
        label: 'Create Task', 
        params: [
          { key: 'assignee_type', label: 'Assignee', type: 'select', options: ['store_manager', 'buyer', 'operations_team', 'category_manager'] },
          { key: 'title', label: 'Task Title', type: 'text' },
          { key: 'due_days', label: 'Due In (days)', type: 'number', min: 1, max: 30 }
        ],
        description: 'Create a task for follow-up'
      },
    },
  },
};


// ============== OPERATORS ==============
// Comparison operators for conditions

export const OPERATORS = {
  equals: { 
    label: 'equals', 
    symbol: '=',
    description: 'Value is exactly equal to'
  },
  not_equals: { 
    label: 'does not equal', 
    symbol: '≠',
    description: 'Value is not equal to'
  },
  greater_than: { 
    label: 'is greater than', 
    symbol: '>',
    description: 'Value is greater than'
  },
  less_than: { 
    label: 'is less than', 
    symbol: '<',
    description: 'Value is less than'
  },
  greater_or_equal: { 
    label: 'is at least', 
    symbol: '≥',
    description: 'Value is greater than or equal to'
  },
  less_or_equal: { 
    label: 'is at most', 
    symbol: '≤',
    description: 'Value is less than or equal to'
  },
  between: { 
    label: 'is between', 
    symbol: '↔', 
    requiresTwoValues: true,
    description: 'Value is between two values (inclusive)'
  },
  in_list: { 
    label: 'is one of', 
    symbol: '∈', 
    requiresList: true,
    description: 'Value matches one of the specified options'
  },
  within_of: { 
    label: 'is within X of', 
    symbol: '≈', 
    requiresReference: true,
    description: 'Value is within a range of another metric'
  },
};


// ============== SCOPE FILTER TYPES ==============
// Types of filters for scoping automations

export const SCOPE_FILTER_TYPES = {
  all: { label: 'All', description: 'Applies to all items' },
  category: { label: 'Category', description: 'Filter by product category' },
  brand: { label: 'Brand', description: 'Filter by brand' },
  upc: { label: 'Specific UPCs', description: 'Filter by specific product UPCs' },
};


// ============== VALUE TYPES ==============
// Types of values for conditions and actions

export const VALUE_TYPES = {
  number: { component: 'NumberInput', icon: Hash },
  percentage: { component: 'PercentSlider', icon: Percent },
  currency: { component: 'CurrencyInput', icon: DollarSign },
  text: { component: 'TextInput', icon: null },
  textarea: { component: 'TextArea', icon: null },
  select: { component: 'Select', icon: null },
  boolean: { component: 'Toggle', icon: null },
  cohort_select: { component: 'CohortSelect', icon: Users },
};


// ============== PRESET TEMPLATES ==============
// Pre-built automation templates

export const AUTOMATION_TEMPLATES = [
  {
    id: 'high_inventory_promo',
    name: 'High Inventory Clearance',
    description: 'When product inventory exceeds 70% of days-on-hand threshold, automatically create a 15% discount promotion for 7 days to clear excess stock and reduce carrying costs.',
    category: 'inventory',
    requires_datasets: ['products', 'inventory'],
    scope: {
      object: 'product',
      filter: { type: 'all' }
    },
    conditions: [
      { 
        id: 'cond_1',
        object: 'product', 
        metric: 'days_on_hand', 
        operator: 'greater_than', 
        value: 70, 
        value_type: 'percentage' 
      }
    ],
    condition_logic: 'AND',
    actions: [
      { 
        id: 'act_1',
        object: 'promotion', 
        action: 'create', 
        parameters: { discount_percent: 15, duration_days: 7, promotion_type: 'markdown' } 
      }
    ]
  },
  {
    id: 'replenishment_reminder',
    name: 'Replenishment Reminder',
    description: 'When a shopper is within 3 days of their typical repurchase cycle for a product, send them a personalized promotion to encourage the repeat purchase and maintain loyalty.',
    category: 'shopper',
    requires_datasets: ['shoppers', 'transactions'],
    scope: null,
    conditions: [
      { 
        id: 'cond_1',
        object: 'shopper', 
        metric: 'days_since_purchase', 
        operator: 'within_of', 
        value: 3, 
        reference_metric: 'purchase_frequency'
      }
    ],
    condition_logic: 'AND',
    actions: [
      { 
        id: 'act_1',
        object: 'shopper', 
        action: 'send_promotion', 
        parameters: { discount_percent: 10, channel: 'email' } 
      }
    ]
  },
  {
    id: 'staffing_fulfillment',
    name: 'Staffing-Based Fulfillment Adjustment',
    description: 'When store staffing levels fall below 60% of optimal, automatically increase pickup and delivery time estimates to set accurate customer expectations and prevent service failures.',
    category: 'operations',
    requires_datasets: ['stores', 'labor'],
    scope: {
      object: 'store',
      filter: { type: 'all' }
    },
    conditions: [
      { 
        id: 'cond_1',
        object: 'store', 
        metric: 'staffing_level', 
        operator: 'less_than', 
        value: 60, 
        value_type: 'percentage' 
      }
    ],
    condition_logic: 'AND',
    actions: [
      { 
        id: 'act_1',
        object: 'store', 
        action: 'adjust_pickup_estimate', 
        parameters: { add_minutes: 15 } 
      },
      { 
        id: 'act_2',
        object: 'store', 
        action: 'adjust_delivery_estimate', 
        parameters: { add_minutes: 20 } 
      }
    ]
  },
  {
    id: 'weather_sponsored',
    name: 'Weather-Driven Promotions',
    description: "When tomorrow's weather forecast predicts rain, automatically create sponsored listing campaigns for weather-relevant products like umbrellas, rain gear, and boots to capture increased demand.",
    category: 'marketing',
    requires_datasets: ['products', 'weather'],
    scope: {
      object: 'product',
      filter: { type: 'category', values: ['Umbrellas', 'Rain Gear', 'Boots', 'Raincoats'] }
    },
    conditions: [
      { 
        id: 'cond_1',
        object: 'context', 
        metric: 'weather_forecast_tomorrow', 
        operator: 'equals', 
        value: 'Rain' 
      }
    ],
    condition_logic: 'AND',
    actions: [
      { 
        id: 'act_1',
        object: 'campaign', 
        action: 'create_sponsored_listing', 
        parameters: { budget: 500, duration_days: 2 } 
      }
    ]
  },
  {
    id: 'slow_mover_alert',
    name: 'Slow Mover Alert',
    description: "When a product's unit velocity falls below 5 units per week over the past 30 days, pause the product from active sales and send an alert to the vendor for possible delistment or promotional support.",
    category: 'inventory',
    requires_datasets: ['products', 'transactions'],
    scope: {
      object: 'product',
      filter: { type: 'all' }
    },
    conditions: [
      { 
        id: 'cond_1',
        object: 'product', 
        metric: 'unit_velocity', 
        operator: 'less_than', 
        value: 5, 
        time_window_days: 30 
      }
    ],
    condition_logic: 'AND',
    actions: [
      { 
        id: 'act_1',
        object: 'product', 
        action: 'pause_sales', 
        parameters: {} 
      },
      { 
        id: 'act_2',
        object: 'notification', 
        action: 'send_alert', 
        parameters: { 
          recipient_type: 'vendor', 
          template: 'low_velocity_alert',
          include_product_details: true 
        } 
      }
    ]
  },
];


// ============== HELPER FUNCTIONS ==============

/**
 * Get metrics available for a given object type
 */
export function getMetricsForObject(objectType) {
  return AUTOMATION_OBJECTS[objectType]?.metrics || {};
}

/**
 * Get actions available for a given object type
 */
export function getActionsForObject(objectType) {
  return AUTOMATION_OBJECTS[objectType]?.actions || {};
}

/**
 * Get objects that have metrics (can be used in conditions)
 */
export function getConditionObjects() {
  return Object.entries(AUTOMATION_OBJECTS)
    .filter(([_, obj]) => Object.keys(obj.metrics).length > 0)
    .map(([key, obj]) => ({ key, ...obj }));
}

/**
 * Get objects that have actions (can be used in actions)
 */
export function getActionObjects() {
  return Object.entries(AUTOMATION_OBJECTS)
    .filter(([_, obj]) => Object.keys(obj.actions).length > 0)
    .map(([key, obj]) => ({ key, ...obj }));
}

/**
 * Get operators applicable for a metric type
 */
export function getOperatorsForMetricType(metricType) {
  // Boolean metrics only support equals/not_equals
  if (metricType === 'boolean') {
    return {
      equals: OPERATORS.equals,
      not_equals: OPERATORS.not_equals,
    };
  }
  
  // Select metrics support equals, not_equals, in_list
  if (metricType === 'select') {
    return {
      equals: OPERATORS.equals,
      not_equals: OPERATORS.not_equals,
      in_list: OPERATORS.in_list,
    };
  }
  
  // Numeric types support all operators
  return OPERATORS;
}

/**
 * Format a condition as human-readable text
 */
export function formatConditionText(condition) {
  const obj = AUTOMATION_OBJECTS[condition.object];
  const metric = obj?.metrics[condition.metric];
  const operator = OPERATORS[condition.operator];
  
  if (!obj || !metric || !operator) return 'Invalid condition';
  
  let valueStr = condition.value;
  if (metric.unit) {
    valueStr = `${condition.value}${metric.unit}`;
  }
  
  let text = `${obj.label} ${metric.label} ${operator.label} ${valueStr}`;
  
  if (condition.time_window_days) {
    text += ` (over ${condition.time_window_days} days)`;
  }
  
  if (condition.reference_metric) {
    const refMetric = obj.metrics[condition.reference_metric];
    text += ` ${refMetric?.label || condition.reference_metric}`;
  }
  
  return text;
}

/**
 * Format an action as human-readable text
 */
export function formatActionText(action) {
  const obj = AUTOMATION_OBJECTS[action.object];
  const actionDef = obj?.actions[action.action];
  
  if (!obj || !actionDef) return 'Invalid action';
  
  let text = `${actionDef.label}`;
  
  // Add parameter summary
  if (action.parameters && Object.keys(action.parameters).length > 0) {
    const paramStrings = [];
    for (const [key, value] of Object.entries(action.parameters)) {
      if (value !== undefined && value !== null && value !== '') {
        const paramDef = actionDef.params.find(p => p.key === key);
        const label = paramDef?.label || key;
        paramStrings.push(`${label}: ${value}`);
      }
    }
    if (paramStrings.length > 0) {
      text += ` (${paramStrings.join(', ')})`;
    }
  }
  
  return text;
}

/**
 * Generate a unique ID for conditions/actions
 */
export function generateId(prefix = 'item') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default {
  AUTOMATION_OBJECTS,
  OPERATORS,
  SCOPE_FILTER_TYPES,
  VALUE_TYPES,
  AUTOMATION_TEMPLATES,
  getMetricsForObject,
  getActionsForObject,
  getConditionObjects,
  getActionObjects,
  getOperatorsForMetricType,
  formatConditionText,
  formatActionText,
  generateId,
};
