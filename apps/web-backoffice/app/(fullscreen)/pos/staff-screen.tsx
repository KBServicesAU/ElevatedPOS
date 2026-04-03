'use client';

import { useState, useEffect } from 'react';
import { Users, Clock, ChevronRight, Loader2 } from 'lucide-react';
import { fetchWithDeviceAuth, type DeviceInfo } from '@/lib/device-auth';
import { PinPad } from '@/components/pin-pad';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role?: string;
  clockedIn?: boolean;
}

// ─── Mock fallback data ───────────────────────────────────────────────────────

const MOCK_EMPLOYEES: StaffMember[] = [
  { id: 'emp-1', firstName: 'Jane',  lastName: 'Doe',   role: 'Manager',  clockedIn: true  },
  { id: 'emp-2', firstName: 'Tom',   lastName: 'Smith', role: 'Cashier',  clockedIn: false },
  { id: 'emp-3', firstName: 'Sarah', lastName: 'Lee',   role: 'Cashier',  clockedIn: false },
];

// ─── Staff card ───────────────────────────────────────────────────────────────

interface StaffCardProps {
  staff: StaffMember;
  deviceInfo: DeviceInfo | null;
  onCardClick: (staff: StaffMember) => void;
  onClockToggle: (staff: StaffMember) => void;
  clockingId: string | null;
}

function StaffCard({ staff, onCardClick, onClockToggle, clockingId }: StaffCardProps) {
  const initials = `${staff.firstName[0] ?? ''}${staff.lastName[0] ?? ''}`.toUpperCase();
  const displayName = `${staff.firstName} ${staff.lastName[0] ?? ''}.`;
  const isClocking = clockingId === staff.id;

  return (
    <div
      className="relative flex cursor-pointer flex-col items-center rounded-2xl bg-[#1a1a2e] p-5 shadow-lg transition-all hover:bg-[#22223a] hover:shadow-indigo-900/30 active:scale-[0.98]"
      onClick={() => onCardClick(staff)}
    >
      {/* Avatar */}
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600 text-xl font-extrabold text-white shadow-md">
        {initials}
      </div>

      {/* Name */}
      <p className="mb-1 text-sm font-semibold text-white">{displayName}</p>

      {/* Role badge */}
      {staff.role && (
        <span className="mb-4 rounded-full bg-indigo-900/60 px-2.5 py-0.5 text-[11px] font-medium text-indigo-300">
          {staff.role}
        </span>
      )}

      {/* Select indicator */}
      <div className="mb-2 flex items-center gap-1 text-xs text-gray-500">
        <span>Tap to login</span>
        <ChevronRight className="h-3 w-3" />
      </div>

      {/* Clock in/out button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClockToggle(staff);
        }}
        disabled={isClocking}
        className={`absolute bottom-3 right-3 flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
          staff.clockedIn
            ? 'bg-red-900/50 text-red-400 hover:bg-red-900/80'
            : 'bg-emerald-900/50 text-emerald-400 hover:bg-emerald-900/80'
        }`}
      >
        {isClocking ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Clock className="h-3 w-3" />
        )}
        {staff.clockedIn ? 'Clock Out' : 'Clock In'}
      </button>
    </div>
  );
}

// ─── StaffScreen ──────────────────────────────────────────────────────────────

export function StaffScreen({
  deviceInfo,
  onSelect,
}: {
  deviceInfo: DeviceInfo | null;
  onSelect: (staff: StaffMember) => void;
}) {
  const [employees, setEmployees] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [clockingId, setClockingId] = useState<string | null>(null);

  // ── Fetch employees on mount ──
  useEffect(() => {
    async function loadEmployees() {
      setLoading(true);
      try {
        const res = await fetchWithDeviceAuth(
          `/api/proxy/employees?locationId=${deviceInfo?.locationId ?? ''}`,
        );
        if (res.ok) {
          const data = (await res.json()) as {
            data: Array<{
              id: string;
              firstName: string;
              lastName: string;
              role?: string;
              clockedIn?: boolean;
            }>;
          };
          if (data.data && data.data.length > 0) {
            setEmployees(data.data);
            return;
          }
        }
      } catch {
        // Network error — fall through to mock data
      } finally {
        setLoading(false);
      }
      setEmployees(MOCK_EMPLOYEES);
    }

    loadEmployees();
  }, [deviceInfo]);

  // ── Clock in/out ──
  const handleClockToggle = async (staff: StaffMember) => {
    setClockingId(staff.id);
    try {
      const res = await fetchWithDeviceAuth('/api/proxy/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: staff.id,
          locationId: deviceInfo?.locationId,
          action: staff.clockedIn ? 'clock_out' : 'clock_in',
        }),
      });
      if (res.ok) {
        setEmployees((prev) =>
          prev.map((e) =>
            e.id === staff.id ? { ...e, clockedIn: !staff.clockedIn } : e,
          ),
        );
      }
    } catch {
      // Silently fail — clock state stays unchanged
    } finally {
      setClockingId(null);
    }
  };

  // ── PIN submission ──
  const handlePinSubmit = async (pin: string) => {
    if (!selectedStaff) return;
    setPinError(null);

    try {
      const res = await fetchWithDeviceAuth('/api/auth/device-pin-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin,
          employeeId: selectedStaff.id,
          locationId: deviceInfo?.locationId,
        }),
      });

      if (res.ok) {
        onSelect(selectedStaff);
      } else {
        setPinError('Incorrect PIN');
      }
    } catch {
      setPinError('Incorrect PIN');
    }
  };

  // ── Render PIN overlay ──
  if (selectedStaff) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0f0f0f]">
        <PinPad
          title={`Login as ${selectedStaff.firstName}`}
          length={4}
          onSubmit={handlePinSubmit}
          onCancel={() => {
            setSelectedStaff(null);
            setPinError(null);
          }}
          error={pinError}
        />
      </div>
    );
  }

  // ── Render staff grid ──
  return (
    <div className="flex min-h-screen flex-col bg-[#0f0f0f]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1e1e2e] px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 shadow-lg">
            <Users className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-white">Who&apos;s working?</h1>
            <p className="text-xs text-gray-500">Select your profile to continue</p>
          </div>
        </div>
        <span className="text-xs font-semibold tracking-widest text-indigo-400 opacity-60">
          ElevatedPOS
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        {loading ? (
          <div className="flex flex-col items-center gap-4 text-gray-500">
            <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
            <p className="text-sm">Loading staff&hellip;</p>
          </div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center gap-3 text-gray-600">
            <Users className="h-12 w-12" />
            <p className="text-sm">No employees found for this location.</p>
          </div>
        ) : (
          <div className="grid w-full max-w-2xl grid-cols-2 gap-4 sm:grid-cols-3">
            {employees.map((staff) => (
              <StaffCard
                key={staff.id}
                staff={staff}
                deviceInfo={deviceInfo}
                onCardClick={(s) => {
                  setPinError(null);
                  setSelectedStaff(s);
                }}
                onClockToggle={handleClockToggle}
                clockingId={clockingId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
