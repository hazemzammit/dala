import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 20 },
  orgName: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  title: { fontSize: 13, color: '#0F7A5C', marginBottom: 4 },
  subtitle: { fontSize: 10, color: '#6B7280' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottom: '1px solid #E5E7EB',
  },
  label: { color: '#6B7280' },
  value: { fontWeight: 700, fontSize: 12 },
  footer: { marginTop: 20, fontSize: 8, color: '#9CA3AF' },
});

export function ReportSummaryDocument({
  organizationName,
  generatedAt,
  revenue,
  expenses,
  profit,
  budgetUsedPercent,
}: {
  organizationName: string;
  generatedAt: string;
  revenue: number;
  expenses: number;
  profit: number;
  budgetUsedPercent: number;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.orgName}>{organizationName}</Text>
          <Text style={styles.title}>Rapport de rentabilité</Text>
          <Text style={styles.subtitle}>Généré le {generatedAt}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Chiffre d&apos;affaires (factures payées)</Text>
          <Text style={styles.value}>{revenue.toLocaleString('fr-TN')} TND</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Dépenses totales</Text>
          <Text style={styles.value}>{expenses.toLocaleString('fr-TN')} TND</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Bénéfice</Text>
          <Text style={styles.value}>{profit.toLocaleString('fr-TN')} TND</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Budget utilisé (chantiers actifs)</Text>
          <Text style={styles.value}>{budgetUsedPercent}%</Text>
        </View>

        <Text style={styles.footer}>Généré via Dala — Tunisia Construction OS.</Text>
      </Page>
    </Document>
  );
}
