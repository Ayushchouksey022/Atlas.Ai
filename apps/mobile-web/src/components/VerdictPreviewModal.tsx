import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useTheme, Card, Button } from '../design-system';
import { VerdictBadge } from '../design-system/VerdictBadge';

export interface VerdictDetail {
  id: string;
  news_item_id: string;
  verdict: 'shield' | 'injection' | 'override';
  target_node_id?: string | null;
  new_node_id?: string | null;
  insert_after_node_ids?: string[];
  reasoning: string;
  confidence?: number;
  target_node_name?: string;
  new_node_name?: string;
  insert_after_names?: string[];
}

export interface VerdictPreviewModalProps {
  visible: boolean;
  newsTitle: string;
  verdict: VerdictDetail | null;
  isLoading: boolean;
  limitError: {
    error: string;
    message?: string;
    limit?: number;
    remaining_analyses?: number;
  } | null;
  isApplying?: boolean;
  onConfirmApply: (verdict: VerdictDetail) => Promise<void> | void;
  onDismissVerdict: (verdict: VerdictDetail) => Promise<void> | void;
  onClose: () => void;
}

export const VerdictPreviewModal: React.FC<VerdictPreviewModalProps> = ({
  visible,
  newsTitle,
  verdict,
  isLoading,
  limitError,
  isApplying = false,
  onConfirmApply,
  onDismissVerdict,
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
          testID="red-button-preview-modal"
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Header */}
            <View style={styles.headerRow}>
              <View style={styles.headerTitleContainer}>
                <Text
                  style={[
                    styles.title,
                    { color: theme.text, ...typography.lg },
                  ]}
                >
                  Red Button Verdict Analysis
                </Text>
                <Text
                  style={[
                    styles.newsTitle,
                    { color: theme.textSecondary, ...typography.xs },
                  ]}
                  numberOfLines={2}
                >
                  {newsTitle}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={[styles.closeIconBtn, { borderRadius: radii.full }]}
                testID="close-red-button-modal"
              >
                <Text style={[styles.closeIconText, { color: theme.textSecondary }]}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>

            {/* Verdict Visual Language Legend (PRD Section 11 & 14 invariant: icon + label) */}
            <View style={styles.verdictLegendBox}>
              <Text style={[styles.verdictLegendItem, { color: theme.text }]}>
                🛡️ <Text style={{ fontWeight: '700' }}>Shield:</Text> No changes needed; your workflow remains stable.
              </Text>
              <Text style={[styles.verdictLegendItem, { color: theme.text }]}>
                ➕ <Text style={{ fontWeight: '700' }}>Injection:</Text> Adds a high-impact breakthrough skill to your roadmap.
              </Text>
              <Text style={[styles.verdictLegendItem, { color: theme.text }]}>
                🔄 <Text style={{ fontWeight: '700' }}>Override:</Text> Replaces an obsolete tool with its approved successor.
              </Text>
            </View>

            {/* 1. Loading State */}
            {isLoading && (
              <View style={styles.loadingContainer} testID="verdict-loading-state">
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={[styles.loadingText, { color: theme.text }]}>
                  Analyzing roadmap against advancement...
                </Text>
                <Text style={[styles.loadingSubtext, { color: theme.textSecondary }]}>
                  Deterministic rules engine evaluating prerequisites and relevance.
                </Text>
              </View>
            )}

            {/* 2. Daily Limit Exceeded State */}
            {!isLoading && limitError && (
              <View style={styles.limitContainer} testID="daily-limit-reached-state">
                <Text style={styles.limitIcon}>⏳</Text>
                <Text
                  style={[
                    styles.limitTitle,
                    { color: theme.text, ...typography.md },
                  ]}
                >
                  Daily Analysis Limit Reached
                </Text>
                <Text
                  style={[
                    styles.limitDescription,
                    { color: theme.textSecondary, marginBottom: spacing.md },
                  ]}
                >
                  {limitError.message ||
                    'You have used your 10 daily on-demand analyses. Precomputed verdicts remain instant and free. On-demand analysis quota will reset tomorrow.'}
                </Text>
                <Button
                  title="Understood"
                  onPress={onClose}
                  testID="close-daily-limit-button"
                />
              </View>
            )}

            {/* 3. Verdict Content */}
            {!isLoading && !limitError && verdict && (
              <View style={styles.verdictBody}>
                {/* Badge & Type Header */}
                <View style={styles.badgeRow}>
                  <VerdictBadge verdict={verdict.verdict} size="lg" />
                  <Text style={[styles.confidenceText, { color: theme.textSecondary }]}>
                    Confidence:{' '}
                    {verdict.confidence
                      ? `${Math.round(verdict.confidence * 100)}%`
                      : 'Verified'}
                  </Text>
                </View>

                {/* Reasoning Box */}
                <Card style={styles.reasoningCard}>
                  <Text
                    style={[
                      styles.reasoningTitle,
                      { color: theme.text, ...typography.xs },
                    ]}
                  >
                    DIFFERENTIAL REASONING
                  </Text>
                  <Text
                    style={[
                      styles.reasoningText,
                      { color: theme.text, ...typography.sm },
                    ]}
                    testID="verdict-reasoning-text"
                  >
                    {verdict.reasoning}
                  </Text>
                </Card>

                {/* SHIELD PREVIEW */}
                {verdict.verdict === 'shield' && (
                  <View style={styles.shieldSection} testID="verdict-shield-preview">
                    <View style={styles.previewNotice}>
                      <Text style={[styles.previewNoticeIcon]}>🛡️</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.previewNoticeTitle, { color: theme.primary }]}>
                          No changes to your roadmap
                        </Text>
                        <Text style={[styles.previewNoticeBody, { color: theme.textSecondary }]}>
                          Your active stack already handles this advancement or renders it irrelevant. No learning nodes will be altered.
                        </Text>
                      </View>
                    </View>

                    <Button
                      title="Got it"
                      onPress={onClose}
                      style={{ marginTop: spacing.lg }}
                      testID="close-shield-button"
                    />
                  </View>
                )}

                {/* INJECTION PREVIEW */}
                {verdict.verdict === 'injection' && (
                  <View style={styles.injectionSection} testID="verdict-injection-preview">
                    <Text
                      style={[
                        styles.sectionHeader,
                        { color: theme.textSecondary, ...typography.xs },
                      ]}
                    >
                      PROPOSED INSERTION PREVIEW
                    </Text>

                    {/* Mini Diagram */}
                    <View
                      style={[
                        styles.miniDiagram,
                        {
                          backgroundColor: 'rgba(22, 163, 74, 0.06)',
                          borderColor: 'rgba(22, 163, 74, 0.25)',
                          borderRadius: radii.md,
                        },
                      ]}
                    >
                      <View style={styles.diagramPrereqRow}>
                        <Text style={[styles.diagramLabel, { color: theme.textSecondary }]}>
                          Prerequisite:
                        </Text>
                        <Text style={[styles.diagramNodeName, { color: theme.text }]}>
                          {verdict.insert_after_names?.[0] || 'Active Foundation / Prerequisite'}
                        </Text>
                      </View>

                      <Text style={styles.diagramArrow}>↓</Text>

                      <View
                        style={[
                          styles.diagramTargetNode,
                          {
                            backgroundColor: 'rgba(22, 163, 74, 0.15)',
                            borderColor: '#16a34a',
                            borderRadius: radii.sm,
                          },
                        ]}
                      >
                        <Text style={[styles.diagramTargetText, { color: '#15803d' }]}>
                          ➕ {verdict.new_node_name || 'New Advancement Skill'} (Available in Todo)
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.explanationText, { color: theme.textSecondary }]}>
                      This breakthrough capability will be inserted into your roadmap immediately after its prerequisites.
                    </Text>

                    <View style={styles.actionButtonsRow}>
                      <TouchableOpacity
                        style={[
                          styles.dismissButton,
                          {
                            borderColor: theme.border,
                            borderRadius: radii.md,
                          },
                        ]}
                        onPress={() => onDismissVerdict(verdict)}
                        disabled={isApplying}
                        testID="dismiss-injection-button"
                      >
                        <Text style={[styles.dismissButtonText, { color: theme.textSecondary }]}>
                          Dismiss
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.confirmButton,
                          {
                            backgroundColor: '#16a34a',
                            borderRadius: radii.md,
                          },
                        ]}
                        onPress={() => onConfirmApply(verdict)}
                        disabled={isApplying}
                        testID="confirm-injection-button"
                      >
                        {isApplying ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.confirmButtonText}>
                            Add to my roadmap
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* OVERRIDE PREVIEW */}
                {verdict.verdict === 'override' && (
                  <View style={styles.overrideSection} testID="verdict-override-preview">
                    <Text
                      style={[
                        styles.sectionHeader,
                        { color: theme.textSecondary, ...typography.xs },
                      ]}
                    >
                      TOOL REPLACEMENT PREVIEW
                    </Text>

                    {/* Swap Comparison Diagram */}
                    <View
                      style={[
                        styles.swapBox,
                        {
                          backgroundColor: 'rgba(217, 119, 6, 0.06)',
                          borderColor: 'rgba(217, 119, 6, 0.25)',
                          borderRadius: radii.md,
                        },
                      ]}
                    >
                      <View style={styles.swapOldRow}>
                        <Text style={[styles.swapTag, { color: '#b45309' }]}>
                          REPLACED:
                        </Text>
                        <Text style={[styles.swapNodeTitle, { color: theme.text }]}>
                          {verdict.target_node_name || 'Existing Tool'}
                        </Text>
                        <Text style={[styles.swapNote, { color: theme.textSecondary }]}>
                          (Preserved in Legacy view with all completion history)
                        </Text>
                      </View>

                      <Text style={styles.swapArrow}>➔</Text>

                      <View
                        style={[
                          styles.swapNewRow,
                          {
                            backgroundColor: 'rgba(217, 119, 6, 0.15)',
                            borderColor: '#d97706',
                            borderRadius: radii.sm,
                          },
                        ]}
                      >
                        <Text style={[styles.swapTag, { color: '#92400e' }]}>
                          NEW SUCCESSOR:
                        </Text>
                        <Text style={[styles.swapNodeTitle, { color: theme.text }]}>
                          {verdict.new_node_name || 'Successor Tool'}
                        </Text>
                        <Text style={[styles.swapBadgeText, { color: '#b45309' }]}>
                          ⚡ Fast-Track (Prerequisites already unlocked)
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.explanationText, { color: theme.textSecondary }]}>
                      Your progress on the old tool is retained. Downstream dependent nodes remain unlocked.
                    </Text>

                    <View style={styles.actionButtonsRow}>
                      <TouchableOpacity
                        style={[
                          styles.dismissButton,
                          {
                            borderColor: theme.border,
                            borderRadius: radii.md,
                          },
                        ]}
                        onPress={() => onDismissVerdict(verdict)}
                        disabled={isApplying}
                        testID="dismiss-override-button"
                      >
                        <Text style={[styles.dismissButtonText, { color: theme.textSecondary }]}>
                          Dismiss
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.confirmButton,
                          {
                            backgroundColor: '#d97706',
                            borderRadius: radii.md,
                          },
                        ]}
                        onPress={() => onConfirmApply(verdict)}
                        disabled={isApplying}
                        testID="confirm-override-button"
                      >
                        {isApplying ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.confirmButtonText}>
                            Swap
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
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
    padding: 16,
  },
  dialog: {
    width: '100%',
    maxWidth: 540,
    maxHeight: '90%',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  scrollContent: {
    padding: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  headerTitleContainer: {
    flex: 1,
  },
  title: {
    fontWeight: '800',
    marginBottom: 4,
  },
  newsTitle: {
    lineHeight: 16,
  },
  closeIconBtn: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIconText: {
    fontSize: 16,
    fontWeight: '700',
  },
  verdictLegendBox: {
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    borderRadius: 8,
    gap: 6,
    marginBottom: 14,
  },
  verdictLegendItem: {
    fontSize: 12,
    lineHeight: 17,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontWeight: '700',
    fontSize: 15,
  },
  loadingSubtext: {
    fontSize: 13,
    textAlign: 'center',
  },
  limitContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    textAlign: 'center',
  },
  limitIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  limitTitle: {
    fontWeight: '800',
    marginBottom: 8,
  },
  limitDescription: {
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 14,
  },
  verdictBody: {
    gap: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: '600',
  },
  reasoningCard: {
    padding: 14,
  },
  reasoningTitle: {
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  reasoningText: {
    lineHeight: 20,
  },
  shieldSection: {
    marginTop: 8,
  },
  previewNotice: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderRadius: 8,
    alignItems: 'center',
  },
  previewNoticeIcon: {
    fontSize: 28,
  },
  previewNoticeTitle: {
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 4,
  },
  previewNoticeBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  injectionSection: {
    gap: 12,
    marginTop: 8,
  },
  overrideSection: {
    gap: 12,
    marginTop: 8,
  },
  sectionHeader: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  miniDiagram: {
    padding: 14,
    borderWidth: 1,
    gap: 8,
    alignItems: 'center',
  },
  diagramPrereqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  diagramLabel: {
    fontSize: 12,
  },
  diagramNodeName: {
    fontSize: 13,
    fontWeight: '700',
  },
  diagramArrow: {
    fontSize: 18,
    color: '#16a34a',
    fontWeight: '800',
  },
  diagramTargetNode: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  diagramTargetText: {
    fontWeight: '700',
    fontSize: 13,
  },
  explanationText: {
    fontSize: 12,
    lineHeight: 17,
  },
  swapBox: {
    padding: 14,
    borderWidth: 1,
    gap: 8,
  },
  swapOldRow: {
    gap: 2,
  },
  swapTag: {
    fontSize: 11,
    fontWeight: '800',
  },
  swapNodeTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  swapNote: {
    fontSize: 11,
  },
  swapArrow: {
    fontSize: 18,
    color: '#d97706',
    fontWeight: '800',
    alignSelf: 'center',
  },
  swapNewRow: {
    padding: 10,
    borderWidth: 1,
    gap: 2,
  },
  swapBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  dismissButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    minHeight: 44, // 44px minimum touch target
  },
  dismissButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
  confirmButton: {
    flex: 2,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44, // 44px minimum touch target
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
