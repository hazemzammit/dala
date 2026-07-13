import { Text, YStack } from 'tamagui';

export default function Index() {
  return (
    <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$neutral25">
      <Text fontFamily="$display" fontSize={28} fontWeight="700">
        Dala
      </Text>
      <Text color="$neutral500" marginTop="$2">
        La base de tout chantier.
      </Text>
    </YStack>
  );
}
