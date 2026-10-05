import { formatMoney } from "@shared/pay/segment";
import { tutorsNeedAdminRate } from "@shared/pay/rates";
import { type DateKey, formatDateKey } from "@shared/time";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import { ListRow, ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useBranchNow, useMyCompensation } from "@/features/data/hooks";
import { type MyDetails, saveMyDetails } from "@/features/profile/api";
import { BirthDateDialog, pickBirthDateAndroid } from "@/features/profile/BirthDatePicker";
import { DoneBar } from "@/features/profile/DoneBar";
import { EditableRow } from "@/features/profile/EditableRow";
import { StaffStatusBadge } from "@/features/profile/StaffStatusBadge";
import { errorMessage } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/state/AuthProvider";
import { useBranch } from "@/state/BranchProvider";

type Key = keyof MyDetails;

/**
 * Account details (True Education's mobile My Info, the website's Profile): name, email and status as the center
 * keeps them; phone, date of birth and home address editable, each saved when the person leaves the field (with an
 * audit entry); start date and pay rates read-only.
 */
export default function AccountScreen() {
  const { branchId, actor, staffId, staff, rules } = useBranch();
  const { email } = useAuth();
  const { today } = useBranchNow();
  const comp = useMyCompensation();
  const staffName = staff?.name || actor.name;
  const record: MyDetails = { phone: staff?.phone ?? "", dob: staff?.dob ?? null, address: staff?.address ?? "" };

  const [phone, setPhone] = useState(record.phone);
  const [address, setAddress] = useState(record.address);
  const [focused, setFocused] = useState<Key | null>(null);
  const [state, setState] = useState<{ key: Key; at: "saving" | "saved" } | null>(null);
  const [dobOpen, setDobOpen] = useState(false);

  // The fields follow the record (a change from the website) unless the person is typing in them.
  const [seen, setSeen] = useState(record);
  if (seen.phone !== record.phone || seen.address !== record.address || seen.dob !== record.dob) {
    setSeen(record);
    if (focused !== "phone") setPhone(record.phone);
    if (focused !== "address") setAddress(record.address);
  }

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A value already on its way isn't sent twice (leaving the field and then the page right away).
  const inFlight = useRef<Partial<Record<Key, string | null>>>({});
  const commit = async (key: Key, value: string | DateKey | null): Promise<boolean> => {
    if (!staffId || !staff) return false;
    const next = typeof value === "string" ? value.trim() : value;
    if (key in inFlight.current && inFlight.current[key] === next) return true;
    inFlight.current[key] = next;
    setState({ key, at: "saving" });
    try {
      const changed = await saveMyDetails(branchId, actor, staffId, staffName, record, { [key]: next });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (changed) {
        setState({ key, at: "saved" });
        flashTimer.current = setTimeout(() => setState(null), 1800);
      } else setState(null);
      return true;
    } catch (e) {
      setState(null);
      toast.error("Couldn’t save", { description: errorMessage(e) });
      return false;
    } finally {
      delete inFlight.current[key];
    }
  };

  // Typing and then leaving the page saves too.
  const pending = useRef({ phone, address, record, commit });
  useEffect(() => {
    pending.current = { phone, address, record, commit };
  });
  useEffect(
    () => () => {
      const p = pending.current;
      if (p.phone.trim() !== p.record.phone) void p.commit("phone", p.phone);
      if (p.address.trim() !== p.record.address) void p.commit("address", p.address);
    },
    [],
  );

  const showAdminRate = tutorsNeedAdminRate(rules, today) || (comp.data?.rates.admin ?? 0) > 0;
  const rate = (n: number | undefined) => (comp.loading ? <Skeleton width={72} height={16} /> : <T tone="muted">{n ? `${formatMoney(n)}/hr` : "Not set"}</T>);
  const stateOf = (key: Key) => (state?.key === key ? state.at : null);

  return (
    <Screen testID="account-screen">
      <ListSection title="Account">
        <ListRow title="Name" right={<Value text={staffName} />} />
        <ListRow title="Email" right={<Value text={email ?? ""} />} />
        <ListRow title="Status" right={<StaffStatusBadge status={staff?.status} />} />
      </ListSection>

      <ListSection title="Personal" footer="Tap a field to change it. Changes save when you’re done.">
        <EditableRow
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          onFocus={() => setFocused("phone")}
          onBlur={() => {
            setFocused(null);
            if (phone.trim() !== record.phone) void commit("phone", phone);
          }}
          placeholder="Add your phone number"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          returnKeyType="done"
          inputAccessoryViewID="account-keyboard"
          state={stateOf("phone")}
          testID="account-phone"
        />
        <ListRow
          title="Date of birth"
          right={stateOf("dob") === "saved" ? <T tone="success">Saved</T> : <T tone="muted">{record.dob ? formatDateKey(record.dob, "long") : "Add"}</T>}
          onPress={() => {
            if (Platform.OS === "android") pickBirthDateAndroid(record.dob, today, (d) => void commit("dob", d));
            else setDobOpen(true);
          }}
          testID="account-dob"
        />
        <EditableRow
          label="Home address"
          value={address}
          onChangeText={setAddress}
          onFocus={() => setFocused("address")}
          onBlur={() => {
            setFocused(null);
            if (address.trim() !== record.address) void commit("address", address);
          }}
          placeholder="Add your home address"
          textContentType="fullStreetAddress"
          autoComplete="street-address"
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          state={stateOf("address")}
          testID="account-address"
        />
      </ListSection>

      <ListSection title="Employment" footer="Contact an admin to change your name, rates or status.">
        <ListRow title="Start date" right={<T tone="muted">{staff?.startDate ? formatDateKey(staff.startDate, "long") : "—"}</T>} />
        <ListRow title="Teaching rate" right={rate(comp.data?.rates.teaching)} />
        {showAdminRate ? <ListRow title="Admin rate" right={rate(comp.data?.rates.admin)} /> : null}
      </ListSection>

      <DoneBar id="account-keyboard" />
      <BirthDateDialog
        open={dobOpen}
        value={record.dob}
        today={today}
        busy={stateOf("dob") === "saving"}
        onClose={() => setDobOpen(false)}
        onSave={async (d) => {
          if (await commit("dob", d)) setDobOpen(false);
        }}
      />
    </Screen>
  );
}

function Value({ text }: { text: string }) {
  return (
    <T tone="muted" numberOfLines={1} style={styles.value}>
      {text}
    </T>
  );
}

const styles = StyleSheet.create({
  value: { maxWidth: "70%", textAlign: "right" },
});
