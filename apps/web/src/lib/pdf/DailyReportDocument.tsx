import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 20 },
  orgName: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  title: { fontSize: 13, color: '#0F7A5C', marginBottom: 4 },
  subtitle: { fontSize: 10, color: '#6B7280' },
  entry: { marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #E5E7EB' },
  photo: { width: '100%', height: 220, objectFit: 'cover', borderRadius: 4, marginBottom: 6 },
  caption: { fontSize: 10, color: '#111318', marginBottom: 2 },
  time: { fontSize: 8, color: '#9CA3AF' },
  footer: { marginTop: 12, fontSize: 8, color: '#9CA3AF' },
});

export type DailyReportEntry = {
  photoUrl: string | null;
  caption: string | null;
  time: string;
};

export function DailyReportDocument({
  organizationName,
  projectName,
  dateLabel,
  entries,
}: {
  organizationName: string;
  projectName: string;
  dateLabel: string;
  entries: DailyReportEntry[];
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.orgName}>{organizationName}</Text>
          <Text style={styles.title}>Compte rendu de chantier — {projectName}</Text>
          <Text style={styles.subtitle}>{dateLabel}</Text>
        </View>

        {entries.length === 0 ? (
          <Text>Aucune entrée de journal pour cette date.</Text>
        ) : (
          entries.map((entry, index) => (
            <View key={index} style={styles.entry} wrap={false}>
              {entry.photoUrl && <Image src={entry.photoUrl} style={styles.photo} />}
              {entry.caption && <Text style={styles.caption}>{entry.caption}</Text>}
              <Text style={styles.time}>{entry.time}</Text>
            </View>
          ))
        )}

        <Text style={styles.footer}>
          {entries.length} entrée(s) au journal ce jour. Généré via Dala — Tunisia Construction OS.
        </Text>
      </Page>
    </Document>
  );
}
