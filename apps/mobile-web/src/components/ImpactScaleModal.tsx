import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';
import { useTheme } from '../design-system';

export interface ImpactScaleModalProps {
  visible: boolean;
  onClose: () => void;
}

const IMPACT_TIERS = [
  {
    range: '9 - 10',
    title: 'Breakthrough Tool or Model',
    description:
      'Fundamentally alters developer workflows, rendering common workflows obsolete or unlocking major autonomous capabilities.',
    color: '#DC2626',
    bgColor: 'rgba(220, 38, 38, 0.1)',
  },
  {
    range: '7 - 8',
    title: 'Major Version or Significant Capability',
    description:
      'Major release of a widely used tool, significant new framework primitives, or architecture overhaul.',
    color: '#D97706',
    bgColor: 'rgba(217, 119, 6, 0.1)',
  },
  {
    range: '5 - 6',
    title: 'Notable Feature Addition',
    description:
      'New feature in an existing tool, productivity enhancement, or notable performance benchmark improvement.',
    color: '#2563EB',
    bgColor: 'rgba(37, 99, 235, 0.1)',
  },
  {
    range: '3 - 4',
    title: 'Minor Patch or Maintenance Update',
    description:
      'Routine maintenance release, minor bugfixes, or small DX polish.',
    color: '#6B7280',
    bgColor: 'rgba(107, 114, 128, 0.1)',
  },
  {
    range: '1 - 2',
    title: 'Trivia or Minor Rumor',
    description:
      'Unverified gossip, minor community blog post, or opinion piece without actionable tooling implications.',
    color: '#9CA3AF',
    bgColor: 'rgba(156, 163, 175, 0.1)',
  },
];

export const ImpactScaleModal: React.FC<ImpactScaleModalProps> = ({
  visible,
  onClose,
}) => {
  const { theme, radii, spacing, typography } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.dialog,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              borderRadius: radii.lg,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
          testID="impact-scale-modal"
          accessibilityViewIsModal
          accessibilityRole="alert"
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text, ...typography.lg }]}>
              Impact Score Scale (1 - 10)
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Standardized Atlas.AI editorial rubric for software engineering advancements
            </Text>
          </View>

          <ScrollView style={styles.scrollContent}>
            {IMPACT_TIERS.map((tier) => (
              <View
                key={tier.range}
                style={[
                  styles.tierCard,
                  {
                    backgroundColor: tier.bgColor,
                    borderColor: tier.color,
                    borderRadius: radii.md,
                    marginBottom: spacing.sm,
                  },
                ]}
              >
                <View style={styles.tierHeader}>
                  <View
                    style={[
                      styles.scoreBadge,
                      { backgroundColor: tier.color, borderRadius: radii.full },
                    ]}
                  >
                    <Text style={styles.scoreText}>{tier.range}</Text>
                  </View>
                  <Text style={[styles.tierTitle, { color: theme.text }]}>
                    {tier.title}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.tierDescription,
                    { color: theme.textSecondary },
                  ]}
                >
                  {tier.description}
                </Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[
              styles.closeButton,
              {
                backgroundColor: theme.surfaceSubtle,
                borderRadius: radii.md,
                marginTop: spacing.md,
              },
            ]}
            onPress={onClose}
            testID="close-scale-modal-button"
            accessibilityRole="button"
            accessibilityLabel="Close impact scale legend"
          >
            <Text style={[styles.closeButtonText, { color: theme.text }]}>
              Got It
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    padding: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  scrollContent: {
    marginVertical: 4,
  },
  tierCard: {
    padding: 12,
    borderLeftWidth: 4,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  scoreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  tierTitle: {
    fontWeight: '700',
    fontSize: 14,
    flex: 1,
  },
  tierDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  closeButton: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
});
