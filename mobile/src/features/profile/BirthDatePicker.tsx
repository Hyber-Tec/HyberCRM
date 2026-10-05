import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { type DateKey, isDateKey, makeDateKey } from "@shared/time";
import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { T } from "@/components/Text";
import { space, useIsDark } from "@/theme";

/**
 * A birth date is a calendar date, not a moment: the wheels work in UTC so the phone's own time zone can't shift it
 * by a day. Wheels (spinner) on both phones: never a month grid with ‹ › arrows (permanent rule).
 */
const toDate = (d: DateKey) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))));
const toKey = (d: Date): DateKey => makeDateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());

const DEFAULT = "1995-01-01";
const MIN = toDate("1920-01-01");

/** Android: the phone's own spinner dialog. Calls back with the picked date, or nothing when canceled. */
export function pickBirthDateAndroid(value: DateKey | null, today: DateKey, onPick: (d: DateKey) => void) {
  DateTimePickerAndroid.open({
    mode: "date",
    display: "spinner",
    design: "default",
    value: toDate(value && isDateKey(value) ? value : DEFAULT),
    timeZoneName: "UTC",
    minimumDate: MIN,
    maximumDate: toDate(today),
    onValueChange: (_e, date) => onPick(toKey(date)),
  });
}

/** iPhone: the date wheels in a dialog, with Save, Remove (when one is set) and Cancel. */
export function BirthDateDialog({
  open,
  value,
  today,
  busy,
  onSave,
  onClose,
}: {
  open: boolean;
  value: DateKey | null;
  today: DateKey;
  busy: boolean;
  onSave: (d: DateKey | null) => void;
  onClose: () => void;
}) {
  const dark = useIsDark();
  const [picked, setPicked] = useState<DateKey>(value && isDateKey(value) ? value : DEFAULT);
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setPicked(value && isDateKey(value) ? value : DEFAULT);
  }
  return (
    <Dialog
      open={open && Platform.OS === "ios"}
      onRequestClose={onClose}
      testID="dob-dialog"
      footer={
        <>
          <Button busy={busy} onPress={() => onSave(picked)} testID="dob-save">
            Save
          </Button>
          <View style={styles.row}>
            {value ? (
              <Button variant="ghost" style={styles.grow} disabled={busy} onPress={() => onSave(null)} testID="dob-clear">
                Remove
              </Button>
            ) : null}
            <Button variant="ghost" style={styles.grow} disabled={busy} onPress={onClose}>
              Cancel
            </Button>
          </View>
        </>
      }
    >
      <T variant="heading">Date of birth</T>
      <DateTimePicker
        value={toDate(picked)}
        mode="date"
        display="spinner"
        timeZoneName="UTC"
        minimumDate={MIN}
        maximumDate={toDate(today)}
        themeVariant={dark ? "dark" : "light"}
        onValueChange={(_e, date) => setPicked(toKey(date))}
        style={styles.picker}
        testID="dob-picker"
      />
    </Dialog>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },
  picker: { alignSelf: "stretch" },
});
