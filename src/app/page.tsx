'use client';

import React, { useState, createContext, useContext, useMemo, FC, ReactNode, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X, Trash2, PlusCircle, Clock, Bell, Edit, List, CheckCircle } from 'lucide-react';

// --- TYPE DEFINITIONS ---
// Defines the structure for which days of the week are selected.
interface WeeklyDays {
  [key: number]: boolean;
}

// Defines the structure for "on the Xth day of the month" patterns.
interface MonthlyOnThe {
  week: number | 'last';
  day: number;
}

// Defines the complete settings for a recurring schedule.
interface RecurringSettings {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  weeklyDays: WeeklyDays;
  monthlyType: 'onDay' | 'onThe';
  monthlyOnDay: number;
  monthlyOnThe: MonthlyOnThe;
  startDate: string;
  endDate: string | null;
}

// Defines the structure for a custom event type.
interface EventType {
    id: string;
    title: string;
    color: string;
}

// A predefined list of event suggestions for the user to add.
const SUGGESTED_EVENT_TYPES: Omit<EventType, 'id'>[] = [
    { title: 'Meeting', color: 'bg-blue-500' },
    { title: 'Appointment', color: 'bg-green-500' },
    { title: 'Birthday', color: 'bg-pink-500' },
    { title: 'Anniversary', color: 'bg-purple-500' },
];

// A palette of colors for creating new custom events.
const COLOR_PALETTE = [
    'bg-red-500', 'bg-amber-500', 'bg-indigo-500', 'bg-cyan-500'
];

// Defines the mode for assigning events.
type EventMode = 'all' | 'individual';

// Defines the structure for an event assigned to a date, including its type and reminder time.
interface EventAssignment {
    typeId: string;
    time: string;
}

// A dictionary to store all event assignments, keyed by date string 'YYYY-MM-DD'.
interface Events {
    [key: string]: EventAssignment;
}

// Defines the structure for the master event when using "Assign to all" mode.
interface MasterEvent {
    typeId: string | null;
    time: string;
}

// Defines the shape of the data passed through the React Context.
interface DatePickerContextType {
  settings: RecurringSettings;
  setSettings: React.Dispatch<React.SetStateAction<RecurringSettings>>;
  recurringDates: string[];
  draftEvents: Events;
  setDraftEvents: React.Dispatch<React.SetStateAction<Events>>;
  eventMode: EventMode;
  setEventMode: React.Dispatch<React.SetStateAction<EventMode>>;
  masterEvent: MasterEvent;
  setMasterEvent: React.Dispatch<React.SetStateAction<MasterEvent>>;
  customEventTypes: EventType[];
  addEventType: (title: string, color: string) => void;
  deleteEventType: (id: string) => void;
}

// Defines the structure of the final saved data object.
interface SavedData {
    settings: RecurringSettings;
    recurringDates: string[];
    events: Events;
    customEventTypes: EventType[];
}

// Defines the structure for an active reminder pop-up.
interface ActiveReminder {
    eventType: EventType;
    time: string;
    date: string;
}


// --- CONTEXT FOR STATE MANAGEMENT ---
// Creates the context to provide state down the component tree.
const DatePickerContext = createContext<DatePickerContextType | undefined>(undefined);

// Custom hook for easy access to the DatePickerContext.
const useDatePicker = () => {
    const context = useContext(DatePickerContext);
    if (!context) {
        throw new Error('useDatePicker must be used within a DatePickerProvider');
    }
    return context;
};

// --- HELPER FUNCTIONS ---
// A utility to conditionally join class names together.
const classNames = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ');

// Gets the total number of days in a given month and year.
const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
// Gets the day of the week for the first day of a given month and year.
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// --- CORE DATE CALCULATION LOGIC ---
/**
 * Calculates all recurring dates based on the provided settings.
 * @param {RecurringSettings} settings - The recurrence rules.
 * @returns {string[]} An array of date strings in 'YYYY-MM-DD' format.
 */
const calculateRecurringDates = (settings: RecurringSettings): string[] => {
    if (!settings.startDate) return [];

    const dates = new Set<string>();
    const {
        frequency,
        interval,
        weeklyDays,
        monthlyType,
        monthlyOnDay,
        monthlyOnThe,
        endDate
    } = settings;
    
    let current = new Date(settings.startDate + 'T00:00:00');
    current.setHours(0, 0, 0, 0);

    const finalEndDate = endDate ? new Date(endDate + 'T23:59:59') : new Date(current.getFullYear() + 5, 0, 1);
    finalEndDate.setHours(23, 59, 59, 999);
    
    let iterations = 0;
    const maxIterations = 2000; // Safety break to prevent infinite loops.

    while (current <= finalEndDate && iterations < maxIterations) {
        iterations++;

        switch (frequency) {
            case 'daily':
                dates.add(current.toISOString().split('T')[0]);
                current.setDate(current.getDate() + interval);
                break;
            case 'weekly':
                 if (iterations === 1) {
                    const startDay = new Date(settings.startDate + 'T00:00:00').getDay();
                    current.setDate(current.getDate() - startDay);
                }
                for (let i = 0; i < 7; i++) {
                    const dayOfWeek = current.getDay();
                    if (weeklyDays[dayOfWeek] && current >= new Date(settings.startDate + 'T00:00:00') && current <= finalEndDate) {
                        dates.add(current.toISOString().split('T')[0]);
                    }
                    current.setDate(current.getDate() + 1);
                }
                current.setDate(current.getDate() + (interval - 1) * 7);
                break;
            case 'monthly':
                let monthDate: Date | null = null;
                if (monthlyType === 'onDay') {
                    monthDate = new Date(current.getFullYear(), current.getMonth(), monthlyOnDay);
                } else { // 'onThe' logic
                    const { week, day } = monthlyOnThe;
                    const daysInMonthArr = Array.from({ length: getDaysInMonth(current.getFullYear(), current.getMonth()) }, (_, i) => new Date(current.getFullYear(), current.getMonth(), i + 1));
                    const matchingDays = daysInMonthArr.filter(d => d.getDay() === day);

                    let targetDate: Date | undefined;
                    if (week === 'last') {
                        targetDate = matchingDays[matchingDays.length - 1];
                    } else {
                        targetDate = matchingDays[week - 1];
                    }
                    
                    if(targetDate) {
                        monthDate = targetDate;
                    }
                }
                
                if(monthDate && monthDate >= new Date(settings.startDate + 'T00:00:00') && monthDate <= finalEndDate) {
                    dates.add(monthDate.toISOString().split('T')[0]);
                }

                current.setMonth(current.getMonth() + interval);
                current.setDate(1);
                break;
            case 'yearly':
                const yearlyDate = new Date(current.getFullYear(), new Date(settings.startDate + 'T00:00:00').getMonth(), new Date(settings.startDate + 'T00:00:00').getDate());
                if(yearlyDate >= new Date(settings.startDate + 'T00:00:00') && yearlyDate <= finalEndDate) {
                    dates.add(yearlyDate.toISOString().split('T')[0]);
                }
                current.setFullYear(current.getFullYear() + interval);
                break;
            default:
                return [];
        }
    }
    return Array.from(dates).sort();
};


// --- UI COMPONENTS ---

// A reusable section wrapper with a title.
const Section: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
    <div className="p-5 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">{title}</h3>
        {children}
    </div>
);

// Component for selecting the recurrence frequency (daily, weekly, etc.).
const RecurrenceOptions: FC = () => {
    const { settings, setSettings } = useDatePicker();
    const frequencies: RecurringSettings['frequency'][] = ['daily', 'weekly', 'monthly', 'yearly'];

    return (
        <Section title="Repeat">
            <div className="flex items-center bg-gray-900 rounded-lg p-1">
                {frequencies.map(freq => (
                    <button
                        key={freq}
                        onClick={() => setSettings(s => ({ ...s, frequency: freq }))}
                        className={classNames(
                            'capitalize w-full px-3 py-1.5 text-sm font-semibold rounded-md transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-gray-900',
                            settings.frequency === freq
                                ? 'bg-teal-500 text-white shadow-md'
                                : 'text-gray-300 hover:bg-gray-700'
                        )}
                    >
                        {freq}
                    </button>
                ))}
            </div>
        </Section>
    );
};

// Component for customizing the recurrence pattern (interval, days of week, etc.).
const Customization: FC = () => {
    const { settings, setSettings } = useDatePicker();
    const { frequency, interval, weeklyDays, monthlyType, monthlyOnDay, monthlyOnThe } = settings;

    const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = Math.max(1, parseInt(e.target.value, 10) || 1);
        setSettings(s => ({ ...s, interval: value }));
    };

    const toggleWeeklyDay = (dayIndex: number) => {
        setSettings(s => ({
            ...s,
            weeklyDays: { ...s.weeklyDays, [dayIndex]: !s.weeklyDays[dayIndex] }
        }));
    };

    const renderWeekly = () => (
        <div>
            <p className="text-sm text-gray-400 mb-3">On these days:</p>
            <div className="flex justify-between">
                {dayNames.map((day, index) => (
                    <button
                        key={`${day}-${index}`}
                        onClick={() => toggleWeeklyDay(index)}
                        className={classNames(
                            'h-9 w-9 rounded-full text-sm font-bold flex items-center justify-center transition-colors duration-200',
                            weeklyDays[index] ? 'bg-teal-500 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                        )}
                    >
                        {day}
                    </button>
                ))}
            </div>
        </div>
    );

    const renderMonthly = () => (
        <div className="space-y-4">
            <div className="flex items-center">
                <input
                    type="radio"
                    id="monthlyOnDay"
                    name="monthlyType"
                    value="onDay"
                    checked={monthlyType === 'onDay'}
                    onChange={() => setSettings(s => ({ ...s, monthlyType: 'onDay' }))}
                    className="h-4 w-4 text-teal-500 bg-gray-700 border-gray-600 focus:ring-teal-500"
                />
                <label htmlFor="monthlyOnDay" className="ml-3 flex items-center text-sm text-gray-300">
                    On day
                    <input
                        type="number"
                        min="1"
                        max="31"
                        value={monthlyOnDay}
                        onChange={(e) => setSettings(s => ({ ...s, monthlyOnDay: parseInt(e.target.value) }))}
                        className="w-16 ml-2 p-1.5 bg-gray-700 border border-gray-600 text-white rounded-md text-center focus:ring-teal-500 focus:border-teal-500"
                        disabled={monthlyType !== 'onDay'}
                    />
                </label>
            </div>
            <div className="flex items-center">
                <input
                    type="radio"
                    id="monthlyOnThe"
                    name="monthlyType"
                    value="onThe"
                    checked={monthlyType === 'onThe'}
                    onChange={() => setSettings(s => ({ ...s, monthlyType: 'onThe' }))}
                    className="h-4 w-4 text-teal-500 bg-gray-700 border-gray-600 focus:ring-teal-500"
                />
                <label htmlFor="monthlyOnThe" className="ml-3 flex items-center text-sm text-gray-300 flex-wrap">
                    On the
                    <select
                        value={monthlyOnThe.week}
                        onChange={(e) => setSettings(s => ({ ...s, monthlyOnThe: { ...s.monthlyOnThe, week: e.target.value === 'last' ? 'last' : parseInt(e.target.value) } }))}
                        className="mx-2 p-1.5 bg-gray-700 border border-gray-600 text-white rounded-md focus:ring-teal-500 focus:border-teal-500"
                        disabled={monthlyType !== 'onThe'}
                    >
                        <option value={1}>first</option>
                        <option value={2}>second</option>
                        <option value={3}>third</option>
                        <option value={4}>fourth</option>
                        <option value="last">last</option>
                    </select>
                    <select
                        value={monthlyOnThe.day}
                        onChange={(e) => setSettings(s => ({ ...s, monthlyOnThe: { ...s.monthlyOnThe, day: parseInt(e.target.value) } }))}
                        className="p-1.5 bg-gray-700 border border-gray-600 text-white rounded-md focus:ring-teal-500 focus:border-teal-500"
                        disabled={monthlyType !== 'onThe'}
                    >
                        {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                </label>
            </div>
        </div>
    );

    return (
        <Section title="Customize">
            <div className="flex items-center space-x-3 mb-4">
                <span className="text-sm text-gray-300">Every</span>
                <input
                    type="number"
                    min="1"
                    value={interval}
                    onChange={handleIntervalChange}
                    className="w-20 p-1.5 bg-gray-700 border border-gray-600 text-white rounded-md text-center focus:ring-teal-500 focus:border-teal-500"
                />
                <span className="text-sm text-gray-300">{frequency === 'daily' ? (interval > 1 ? 'days' : 'day') : (interval > 1 ? `${frequency}s` : frequency)}</span>
            </div>
            {frequency === 'weekly' && renderWeekly()}
            {frequency === 'monthly' && renderMonthly()}
        </Section>
    );
};

// Component for selecting the start and optional end date.
const DateRange: FC = () => {
    const { settings, setSettings } = useDatePicker();

    const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
        setSettings(s => ({ ...s, [field]: value || null }));
    };

    return (
        <Section title="Date Range">
            <div className="space-y-4">
                <div>
                    <label htmlFor="startDate" className="block text-sm font-medium text-gray-400 mb-1">Starts on</label>
                    <input
                        type="date"
                        id="startDate"
                        value={settings.startDate}
                        onChange={(e) => handleDateChange('startDate', e.target.value)}
                        className="w-full p-2 bg-gray-700 border border-gray-600 text-white rounded-lg shadow-sm focus:ring-teal-500 focus:border-teal-500"
                        style={{ colorScheme: 'dark' }}
                    />
                </div>
                <div>
                    <label htmlFor="endDate" className="block text-sm font-medium text-gray-400 mb-1">Ends on (Optional)</label>
                    <input
                        type="date"
                        id="endDate"
                        value={settings.endDate || ''}
                        onChange={(e) => handleDateChange('endDate', e.target.value)}
                        className="w-full p-2 bg-gray-700 border border-gray-600 text-white rounded-lg shadow-sm focus:ring-teal-500 focus:border-teal-500"
                        style={{ colorScheme: 'dark' }}
                    />
                </div>
            </div>
        </Section>
    );
};

// Component for managing custom event types.
const ManageEvents: FC = () => {
    const { customEventTypes, addEventType, deleteEventType } = useDatePicker();
    const [title, setTitle] = useState('');
    const [color, setColor] = useState(COLOR_PALETTE[0]);

    const handleAddCustom = () => {
        if (title.trim()) {
            addEventType(title.trim(), color);
            setTitle('');
        }
    };
    
    const handleAddSuggestion = (suggestion: Omit<EventType, 'id'>) => {
        if (!customEventTypes.some(et => et.title.toLowerCase() === suggestion.title.toLowerCase())) {
            addEventType(suggestion.title, suggestion.color);
        }
    }

    return (
         <Section title="Manage Event Types">
            <div className="space-y-4">
                <div>
                    <h4 className="text-sm font-semibold text-gray-300 mb-2">Suggestions</h4>
                    <div className="flex flex-wrap gap-2">
                        {SUGGESTED_EVENT_TYPES.map(sugg => (
                            <button 
                                key={sugg.title}
                                onClick={() => handleAddSuggestion(sugg)}
                                className="flex items-center px-3 py-1 bg-gray-700 text-sm text-white rounded-full hover:bg-gray-600 transition-colors"
                            >
                                <PlusCircle className="h-4 w-4 mr-2" />
                                {sugg.title}
                            </button>
                        ))}
                    </div>
                </div>
                 <div className="p-3 bg-gray-900 rounded-lg">
                    <h4 className="text-sm font-semibold text-gray-300 mb-2">Add Custom Event</h4>
                    <input
                        type="text"
                        placeholder="Event title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full p-2 bg-gray-700 border border-gray-600 text-white rounded-lg mb-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                    <div className="flex items-center justify-between">
                         <div className="flex space-x-2">
                            {COLOR_PALETTE.map(c => (
                                <button key={c} onClick={() => setColor(c)} className={classNames('h-6 w-6 rounded-full transition-transform duration-150', c, color === c ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-white' : 'hover:scale-110')}>
                                </button>
                            ))}
                        </div>
                        <button onClick={handleAddCustom} className="px-4 py-1.5 bg-teal-500 text-white text-sm font-semibold rounded-lg hover:bg-teal-600">Add</button>
                    </div>
                </div>
                <div>
                    <h4 className="text-sm font-semibold text-gray-300 mb-2">Your Event Types</h4>
                    <div className="space-y-2">
                        {customEventTypes.length === 0 && <p className="text-sm text-gray-500">No event types added yet.</p>}
                        {customEventTypes.map(et => (
                            <div key={et.id} className="flex items-center justify-between p-2 bg-gray-900 rounded-lg">
                                <div className="flex items-center">
                                    <span className={classNames('h-4 w-4 rounded-full mr-3', et.color)}></span>
                                    <span className="text-sm text-white">{et.title}</span>
                                </div>
                                <button onClick={() => deleteEventType(et.id)} className="p-1 text-gray-500 hover:text-red-400">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Section>
    )
}

// Component for choosing how events are assigned (to all or individually).
const EventOptions: FC = () => {
    const { eventMode, setEventMode, masterEvent, setMasterEvent, customEventTypes } = useDatePicker();

    return (
        <Section title="Event Assignment">
            <div className="flex items-center bg-gray-900 rounded-lg p-1 mb-4">
                <button onClick={() => setEventMode('all')} className={classNames('w-full px-3 py-1.5 text-sm font-semibold rounded-md transition-colors', eventMode === 'all' ? 'bg-teal-500 text-white' : 'text-gray-300 hover:bg-gray-700')}>Assign to all</button>
                <button onClick={() => setEventMode('individual')} className={classNames('w-full px-3 py-1.5 text-sm font-semibold rounded-md transition-colors', eventMode === 'individual' ? 'bg-teal-500 text-white' : 'text-gray-300 hover:bg-gray-700')}>Assign individually</button>
            </div>
            {eventMode === 'all' && (
                <div className="space-y-3">
                    <div>
                        <label htmlFor="master-event" className="block text-sm font-medium text-gray-400 mb-2">Select event for all dates</label>
                        <select
                            id="master-event"
                            value={masterEvent.typeId || ''}
                            onChange={(e) => setMasterEvent(me => ({ ...me, typeId: e.target.value || null }))}
                            className="w-full p-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-teal-500 focus:border-teal-500"
                        >
                            <option value="">No Event</option>
                            {customEventTypes.map(et => <option key={et.id} value={et.id}>{et.title}</option>)}
                        </select>
                    </div>
                    {masterEvent.typeId && (
                         <div>
                            <label htmlFor="master-time" className="block text-sm font-medium text-gray-400 mb-2">Reminder time</label>
                            <input
                                type="time"
                                id="master-time"
                                value={masterEvent.time}
                                onChange={(e) => setMasterEvent(me => ({ ...me, time: e.target.value }))}
                                className="w-full p-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-teal-500 focus:border-teal-500"
                                style={{ colorScheme: 'dark' }}
                            />
                        </div>
                    )}
                </div>
            )}
        </Section>
    )
}

// Component for previewing the schedule and assigning individual events.
const MiniCalendar: FC = () => {
    const { recurringDates, draftEvents, setDraftEvents, eventMode, masterEvent, customEventTypes } = useDatePicker();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [individualTime, setIndividualTime] = useState('09:00');

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const calendarDays = Array(firstDay).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));
    
    const recurringDatesInView = useMemo(() => {
        const dates = new Set<number>();
        recurringDates.forEach(dateStr => {
            const d = new Date(dateStr + 'T00:00:00');
            if (d.getFullYear() === year && d.getMonth() === month) {
                dates.add(d.getDate());
            }
        });
        return dates;
    }, [recurringDates, year, month]);

    const changeMonth = (offset: number) => {
        setCurrentDate(prev => {
            const newDate = new Date(prev);
            newDate.setMonth(newDate.getMonth() + offset);
            return newDate;
        });
    };
    
    const handleDayClick = (day: number) => {
        if (eventMode !== 'individual') return;
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        setSelectedDate(dateStr);
        setIndividualTime(draftEvents[dateStr]?.time || '09:00');
    };

    const handleAssignEvent = (eventTypeId: string) => {
        if (!selectedDate) return;
        setDraftEvents(prev => ({ ...prev, [selectedDate]: { typeId: eventTypeId, time: individualTime } }));
        setSelectedDate(null);
    };
    
    const handleIndividualTimeChange = (time: string) => {
        setIndividualTime(time);
        if (selectedDate && draftEvents[selectedDate]) {
            setDraftEvents(prev => ({ ...prev, [selectedDate]: { ...prev[selectedDate], time } }));
        }
    }

    const handleRemoveEvent = () => {
        if (!selectedDate) return;
        setDraftEvents(prev => {
            const newEvents = { ...prev };
            delete newEvents[selectedDate];
            return newEvents;
        });
        setSelectedDate(null);
    }

    return (
        <Section title="Preview">
            <div className="bg-gray-900 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                    <button onClick={() => changeMonth(-1)} className="p-1.5 rounded-full hover:bg-gray-700 transition-colors">
                        <ChevronLeft className="h-5 w-5 text-gray-400" />
                    </button>
                    <h4 className="font-semibold text-gray-200 text-md">{monthNames[month]} {year}</h4>
                    <button onClick={() => changeMonth(1)} className="p-1.5 rounded-full hover:bg-gray-700 transition-colors">
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                    </button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 font-bold">
                    {dayNames.map((day, index) => <div key={`${day}-${index}`}>{day}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-y-1 mt-2">
                    {calendarDays.map((day, index) => {
                        const dateStr = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
                        const isRecurring = day ? recurringDatesInView.has(day) : false;
                        
                        let eventAssignment: EventAssignment | null = null;
                        if (isRecurring && eventMode === 'all' && masterEvent.typeId) {
                            eventAssignment = { typeId: masterEvent.typeId, time: masterEvent.time };
                        } else if (eventMode === 'individual') {
                            eventAssignment = day ? draftEvents[dateStr] : null;
                        }

                        const eventType = eventAssignment ? customEventTypes.find(e => e.id === eventAssignment.typeId) : null;
                        
                        return (
                        <button
                            key={index}
                            disabled={!day || eventMode !== 'individual'}
                            onClick={() => day && handleDayClick(day)}
                            className={classNames(
                                'h-9 w-9 flex items-center justify-center rounded-full text-sm mx-auto relative transition-colors',
                                day && eventMode === 'individual' && 'hover:bg-gray-700',
                                isRecurring ? 'bg-teal-500 text-white font-bold' : 'text-gray-300',
                                day && selectedDate === dateStr && 'ring-2 ring-teal-400'
                            )}
                        >
                            {day}
                            {eventType && <div className={classNames("absolute bottom-1 h-1.5 w-1.5 rounded-full", eventType.color)}></div>}
                        </button>
                    )})}
                </div>
                {selectedDate && eventMode === 'individual' && (
                    <div className="mt-4 p-3 bg-gray-800 rounded-lg">
                        <label className="block text-sm font-medium text-gray-400 mb-3">
                            Assign Event to {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                        </label>
                        <div className="space-y-2">
                            {customEventTypes.map(eventType => (
                                <button 
                                    key={eventType.id} 
                                    onClick={() => handleAssignEvent(eventType.id)}
                                    className="w-full flex items-center p-2 text-left text-sm text-white rounded-md hover:bg-gray-700 transition-colors"
                                >
                                    <span className={classNames("h-4 w-4 rounded-full mr-3", eventType.color)}></span>
                                    {eventType.title}
                                </button>
                            ))}
                        </div>
                         {draftEvents[selectedDate] && (
                            <div className="mt-3 pt-3 border-t border-gray-700">
                                <label htmlFor="individual-time" className="block text-sm font-medium text-gray-400 mb-2">Reminder time</label>
                                <input
                                    type="time"
                                    id="individual-time"
                                    value={individualTime}
                                    onChange={(e) => handleIndividualTimeChange(e.target.value)}
                                    className="w-full p-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-teal-500 focus:border-teal-500"
                                    style={{ colorScheme: 'dark' }}
                                />
                            </div>
                        )}
                        <div className="border-t border-gray-700 mt-3 pt-3">
                            <button onClick={handleRemoveEvent} className="w-full text-sm text-red-400 hover:text-red-300 text-center">
                                Remove Event
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Section>
    );
};

// --- MAIN DATE PICKER COMPONENT ---
const RecurringDatePicker: FC<{ 
    onSave: (data: SavedData) => void; 
    onClose: () => void;
    initialSettings: RecurringSettings | null;
    initialEvents: Events;
    customEventTypes: EventType[];
    addEventType: (title: string, color: string) => void;
    deleteEventType: (id: string) => void;
}> = ({ onSave, onClose, initialSettings, initialEvents, customEventTypes, addEventType, deleteEventType }) => {
    const [settings, setSettings] = useState<RecurringSettings | null>(null);
    const [draftEvents, setDraftEvents] = useState<Events>(initialEvents);
    const [eventMode, setEventMode] = useState<EventMode>('individual');
    const [masterEvent, setMasterEvent] = useState<MasterEvent>({ typeId: null, time: '09:00' });

    // Initialize settings when the component mounts or when initialSettings change.
    useEffect(() => {
        if (initialSettings) {
            setSettings(initialSettings);
        } else {
            const today = new Date();
            const todayString = today.toISOString().split('T')[0];
            setSettings({
                frequency: 'daily',
                interval: 1,
                weeklyDays: { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false },
                monthlyType: 'onDay',
                monthlyOnDay: today.getDate(),
                monthlyOnThe: { week: 1, day: today.getDay() },
                startDate: todayString,
                endDate: null,
            });
        }
    }, [initialSettings]);

    const recurringDates = useMemo(() => (settings ? calculateRecurringDates(settings) : []), [settings]);

    const handleSave = () => {
        if (!settings) return;

        let finalEvents: Events = {};
        if (eventMode === 'all' && masterEvent.typeId) {
            recurringDates.forEach(date => {
                finalEvents[date] = { typeId: masterEvent.typeId!, time: masterEvent.time };
            });
        } else if (eventMode === 'individual') {
            finalEvents = draftEvents;
        }

        onSave({ settings, recurringDates, events: finalEvents, customEventTypes });
    };
    
    // Render a loading state until settings are initialized on the client.
    if (!settings) {
        return (
             <div className="w-full max-w-sm h-full mx-auto bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 flex justify-center items-center">
                 <p className="text-gray-400">Loading...</p>
            </div>
        );
    }

    return (
        <DatePickerContext.Provider value={{ settings, setSettings, recurringDates, draftEvents, setDraftEvents, eventMode, setEventMode, masterEvent, setMasterEvent, customEventTypes, addEventType, deleteEventType }}>
            <div className="w-full max-w-sm mx-auto bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 flex flex-col h-full">
                <div className="p-4 flex items-center justify-between border-b border-gray-700 bg-gray-800 flex-shrink-0">
                    <h2 className="text-lg font-bold text-white">Set Recurrence</h2>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-700 transition-colors">
                        <X className="h-5 w-5 text-gray-400" />
                    </button>
                </div>
                <div className="flex-grow overflow-y-auto">
                    <RecurrenceOptions />
                    <Customization />
                    <DateRange />
                    <ManageEvents />
                    <EventOptions />
                    <MiniCalendar />
                </div>
                <div className="p-4 bg-gray-800 border-t border-gray-700 flex-shrink-0">
                    <button
                        onClick={handleSave}
                        className="w-full px-6 py-3 bg-teal-500 text-white font-bold rounded-xl shadow-lg hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-teal-500 transition-all duration-200"
                    >
                        Save
                    </button>
                </div>
            </div>
        </DatePickerContext.Provider>
    );
};

// A pop-up component for event reminders.
const ReminderPopup: FC<{ reminder: ActiveReminder, onClose: () => void }> = ({ reminder, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="relative bg-gray-800 border border-teal-500/50 rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
                 <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-teal-500/20 mb-4">
                    <Bell className="h-8 w-8 text-teal-400" />
                </div>
                <h3 className="text-xl font-bold text-white">Reminder!</h3>
                <p className="mt-2 text-gray-300">
                    It's time for your event: <span className="font-bold">{reminder.eventType.title}</span>
                </p>
                <p className="text-sm text-gray-500 mt-1">Scheduled for {reminder.time}</p>
                <button 
                    onClick={onClose}
                    className="mt-6 w-full px-4 py-2 bg-teal-500 text-white font-bold rounded-lg hover:bg-teal-600"
                >
                    Dismiss
                </button>
            </div>
        </div>
    )
}

// A pop-up component to confirm that reminders have been set.
const ConfirmationPopup: FC = () => {
    return (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-gray-700 border border-teal-500/50 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center space-x-3 z-50">
            <CheckCircle className="h-6 w-6 text-teal-400" />
            <span className="font-semibold">Reminders Set!</span>
        </div>
    )
}

// --- MAIN APPLICATION COMPONENT ---
export default function App() {
    // State for showing/hiding the main date picker modal.
    const [showPicker, setShowPicker] = useState(false);
    // State to store the last saved schedule data.
    const [savedData, setSavedData] = useState<SavedData | null>(null);
    // State for the master list of all scheduled events.
    const [events, setEvents] = useState<Events>({});
    // State for the list of user-created event types.
    const [customEventTypes, setCustomEventTypes] = useState<EventType[]>([]);
    // State to manage the currently active reminder pop-up.
    const [activeReminder, setActiveReminder] = useState<ActiveReminder | null>(null);
    // State to keep track of reminders that have already been shown to the user.
    const [triggeredReminders, setTriggeredReminders] = useState<Set<string>>(new Set());
    // State for showing/hiding the "All Events" list modal.
    const [showAllEvents, setShowAllEvents] = useState(false);
    // State to determine if the picker is editing an existing schedule or creating a new one.
    const [isEditing, setIsEditing] = useState(false);
    // State for showing the "Reminder Set" confirmation pop-up.
    const [showConfirmation, setShowConfirmation] = useState(false);

    // Function to add a new custom event type.
    const addEventType = (title: string, color: string) => {
        const newEvent: EventType = {
            id: `evt_${Date.now()}`,
            title,
            color
        };
        setCustomEventTypes(prev => [...prev, newEvent]);
    };

    // Function to delete a custom event type and all its assignments.
    const deleteEventType = (id: string) => {
        setCustomEventTypes(prev => prev.filter(et => et.id !== id));
        const newEvents = { ...events };
        Object.keys(newEvents).forEach(date => {
            if (newEvents[date]?.typeId === id) {
                delete newEvents[date];
            }
        });
        setEvents(newEvents);
        if (savedData) {
            setSavedData(prev => prev ? ({...prev, events: newEvents, customEventTypes: prev.customEventTypes.filter(et => et.id !== id)}) : null);
        }
    };

    // Callback function when the user saves a schedule from the picker.
    const handleSave = (data: SavedData) => {
        // Merge new events with existing events instead of overwriting.
        const mergedEvents = { ...events, ...data.events };
        
        const newSavedData = {
            settings: data.settings,
            recurringDates: [...new Set([...(savedData?.recurringDates || []), ...data.recurringDates])],
            events: mergedEvents,
            customEventTypes: data.customEventTypes,
        };

        setSavedData(newSavedData);
        setEvents(mergedEvents);
        setCustomEventTypes(data.customEventTypes);
        setShowPicker(false);
        setShowConfirmation(true);
        setTimeout(() => setShowConfirmation(false), 3000); // Hide confirmation after 3 seconds.
    };

    // Function to delete a single event from the schedule.
    const handleDeleteEvent = (date: string) => {
        const newEvents = {...events};
        delete newEvents[date];
        setEvents(newEvents);
        if (savedData) {
            setSavedData(prev => prev ? ({...prev, events: newEvents}) : null);
        }
    };
    
    // Opens the picker in "edit" mode.
    const handleEdit = () => {
        setIsEditing(true);
        setShowPicker(true);
    }

    // Opens the picker in "create new" mode.
    const handleCreateNew = () => {
        setIsEditing(false);
        setShowPicker(true);
    }
    
    // Effect hook to check for reminders periodically.
    useEffect(() => {
        const reminderInterval = setInterval(() => {
            if (!savedData || activeReminder) return;

            const now = new Date();
            const currentDateStr = now.toISOString().split('T')[0];
            const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            
            const eventForToday = savedData.events[currentDateStr];
            const reminderId = `${currentDateStr}-${eventForToday?.time}`;

            // Trigger reminder if it's due and hasn't been triggered before.
            if (eventForToday && eventForToday.time === currentTimeStr && !triggeredReminders.has(reminderId)) {
                const eventType = savedData.customEventTypes.find(et => et.id === eventForToday.typeId);
                if (eventType) {
                    setActiveReminder({ eventType, time: eventForToday.time, date: currentDateStr });
                    setTriggeredReminders(prev => new Set(prev).add(reminderId));
                }
            }

        }, 10000); // Check every 10 seconds for demo purposes.

        return () => clearInterval(reminderInterval);
    }, [savedData, activeReminder, triggeredReminders]);


    return ( //website interface
        <main className="bg-gray-900 min-h-screen w-full flex flex-col items-center justify-center p-4 font-sans text-white">
            {activeReminder && <ReminderPopup reminder={activeReminder} onClose={() => setActiveReminder(null)} />}
            {showConfirmation && <ConfirmationPopup />}
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">Remind Me</h1>
                    <p className="text-gray-400">A Website That Never Forgets.</p>
                </div>

                {!savedData ? (
                    <button
                        onClick={handleCreateNew}
                        className="w-full flex items-center justify-between p-4 bg-gray-800 border border-gray-700 rounded-xl shadow-lg shadow-black/20 text-left focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all hover:bg-gray-700"
                    >
                        <span className="text-white font-semibold">Set Recurrence</span>
                        <CalendarIcon className="h-5 w-5 text-teal-400" />
                    </button>
                ) : (
                    <div className="p-5 bg-gray-800 rounded-xl shadow-lg shadow-black/20 border border-gray-700">
                        <h3 className="font-bold text-lg text-white mb-4">Your Schedule</h3>
                         <div className="mt-4 pt-4 border-t border-gray-700 flex space-x-3">
                            <button onClick={handleEdit} className="w-full p-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors flex items-center justify-center"><Edit className="h-4 w-4 mr-2"/>Edit Last</button>
                            <button onClick={() => setShowAllEvents(true)} className="w-full p-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors flex items-center justify-center"><List className="h-4 w-4 mr-2"/>All Events</button>
                            <button onClick={handleCreateNew} className="w-full p-2 bg-teal-500 text-white font-semibold rounded-lg hover:bg-teal-600 transition-colors">Create New</button>
                        </div>
                    </div>
                )}

                {showPicker && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4">
                        <div className="absolute inset-0" onClick={() => setShowPicker(false)}></div>
                        <div className="z-50 w-full max-w-sm h-full max-h-[90vh] sm:max-h-[650px]">
                            <RecurringDatePicker 
                                onSave={handleSave} 
                                onClose={() => setShowPicker(false)}
                                initialSettings={isEditing && savedData ? savedData.settings : null}
                                initialEvents={isEditing ? events : {}}
                                customEventTypes={customEventTypes}
                                addEventType={addEventType}
                                deleteEventType={deleteEventType}
                            />
                        </div>
                    </div>
                )}
                
                {showAllEvents && savedData && (
                     <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4">
                        <div className="relative z-50 w-full max-w-md h-full max-h-[90vh] sm:max-h-[650px] bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 flex flex-col">
                           <div className="p-4 flex items-center justify-between border-b border-gray-700 flex-shrink-0">
                                <h2 className="text-lg font-bold text-white">All Scheduled Events</h2>
                                <button onClick={() => setShowAllEvents(false)} className="p-1.5 rounded-full hover:bg-gray-700 transition-colors">
                                    <X className="h-5 w-5 text-gray-400" />
                                </button>
                            </div>
                            <div className="flex-grow overflow-y-auto p-5">
                                {Object.keys(events).length > 0 ? (
                                    <ul className="space-y-2">
                                        {Object.entries(events)
                                            .sort(([dateA], [dateB]) => new Date(dateA).getTime() - new Date(dateB).getTime())
                                            .map(([date, assignment]) => {
                                            const eventType = customEventTypes.find(e => e.id === assignment.typeId);
                                            if (!eventType) return null;
                                            return (
                                                <li key={date} className="flex items-center justify-between p-2 bg-gray-900 rounded-lg">
                                                    <div className="flex items-center text-sm text-gray-300">
                                                        <span className={classNames("h-3 w-3 rounded-full mr-3 flex-shrink-0", eventType.color)}></span>
                                                        <div>
                                                            <span className="font-bold text-white">{eventType.title}</span>
                                                            <div className="text-xs text-gray-400">{new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })} at {assignment.time}</div>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => handleDeleteEvent(date)} className="p-1.5 text-gray-400 hover:text-red-400">
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-gray-500 text-center mt-8">No events scheduled yet.</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
