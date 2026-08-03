import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

/**
 * Doc 06 §6.3 — facture PDF. Template minimal (numéro, client, chantier,
 * montant, échéance, nom de l'organisation) — pas de logo/coordonnées
 * bancaires personnalisées pour cette première version (Doc 06 mentionne
 * "logo, coordonnées bancaires" ; organizations.logo_url existe déjà en
 * base mais son intégration ici, avec gestion d'image dans @react-pdf/
 * renderer, est laissée pour une itération suivante — flagged for Hazem).
 */
const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica' },
  header: { marginBottom: 24 },
  orgName: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  invoiceTitle: { fontSize: 14, color: '#0F7A5C', marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { color: '#6B7280' },
  value: { fontWeight: 700 },
  amountBox: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#F0FDF9',
    borderRadius: 8,
  },
  amountLabel: { fontSize: 11, color: '#6B7280' },
  amountValue: { fontSize: 24, fontWeight: 700, marginTop: 4 },
});

export function InvoiceDocument({
  organizationName,
  invoiceNumber,
  clientName,
  projectName,
  amount,
  dueDate,
  status,
}: {
  organizationName: string;
  invoiceNumber: string;
  clientName: string;
  projectName: string;
  amount: number;
  dueDate: string;
  status: string;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.orgName}>{organizationName}</Text>
          <Text style={styles.invoiceTitle}>Facture {invoiceNumber}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Client</Text>
          <Text style={styles.value}>{clientName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Chantier</Text>
          <Text style={styles.value}>{projectName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Date d&apos;échéance</Text>
          <Text style={styles.value}>{new Date(dueDate).toLocaleDateString('fr-TN')}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Statut</Text>
          <Text style={styles.value}>{status}</Text>
        </View>

        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>Montant total</Text>
          <Text style={styles.amountValue}>{amount.toLocaleString('fr-TN')} TND</Text>
        </View>
      </Page>
    </Document>
  );
}
