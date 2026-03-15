import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../services/auth_service.dart';
import '../services/checkin_service.dart';
import 'login_screen.dart';

class ScannerScreen extends StatefulWidget {
  const ScannerScreen({super.key});

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> {
  final _authService = AuthService();
  late final _checkinService = CheckinService(_authService);
  late final MobileScannerController _scannerController;
  bool _isProcessing = false;

  @override
  void initState() {
    super.initState();
    _scannerController = MobileScannerController(
      detectionSpeed: DetectionSpeed.normal,
      facing: CameraFacing.back,
    );
  }

  @override
  void dispose() {
    _scannerController.dispose();
    super.dispose();
  }

  /// QRコードの値からチェックインコードを抽出
  /// URL形式（https://...?code=XXXX-XXXX-XXXX）と生コード両方に対応
  String _extractCode(String rawValue) {
    final uri = Uri.tryParse(rawValue);
    if (uri != null &&
        uri.hasScheme &&
        uri.queryParameters.containsKey('code')) {
      return uri.queryParameters['code']!;
    }
    return rawValue;
  }

  void _onDetect(BarcodeCapture capture) {
    if (_isProcessing) return;

    final barcode = capture.barcodes.firstOrNull;
    if (barcode == null || barcode.rawValue == null) return;

    final code = _extractCode(barcode.rawValue!);
    _processCode(code);
  }

  static final _validCodePattern = RegExp(r'^[A-HJ-NP-Z2-9]{12}$');

  Future<void> _processCode(String code) async {
    if (_isProcessing) return;

    // コード形式チェック（ハイフン除去後12文字、Base32文字セット）
    final clean = code.replaceAll('-', '').toUpperCase();
    if (clean.length != 12 || !_validCodePattern.hasMatch(clean)) {
      _showErrorSnackBar('無効なコード形式です');
      return;
    }

    setState(() => _isProcessing = true);
    _scannerController.stop();

    final result = await _checkinService.verify(code);

    if (!mounted) return;

    if (result.unauthorized) {
      await _authService.logout();
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
        (_) => false,
      );
      return;
    }

    if (result.error != null) {
      _showErrorSnackBar(result.error!);
      _resumeScanner();
      return;
    }

    if (result.ticket != null) {
      _showTicketSheet(code, result.ticket!);
    }
  }

  void _showTicketSheet(String code, TicketInfo ticket) {
    showModalBottomSheet(
      context: context,
      isDismissible: true,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => TicketBottomSheet(
        code: code,
        ticket: ticket,
        onCheckin: () => _executeCheckin(ctx, code),
        onClose: () => Navigator.of(ctx).pop(),
      ),
    ).whenComplete(_resumeScanner);
  }

  Future<void> _executeCheckin(BuildContext sheetContext, String code) async {
    final result = await _checkinService.checkin(code);

    if (!mounted) return;

    Navigator.of(sheetContext).pop();

    if (result.success) {
      final productDisplay = result.variantTitle != null
          ? '${result.productName} (${result.variantTitle})'
          : result.productName ?? '';
      _showSuccessSnackBar('受付完了: ${result.orderName} $productDisplay');
    } else {
      _showErrorSnackBar(result.error ?? 'チェックインに失敗しました');
    }
  }

  void _resumeScanner() {
    if (mounted) {
      setState(() => _isProcessing = false);
      _scannerController.start();
    }
  }

  void _showSuccessSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.green,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  void _showErrorSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.red,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text('QRコード読み取り'),
      ),
      body: Stack(
        children: [
          MobileScanner(controller: _scannerController, onDetect: _onDetect),
          // スキャンエリアのオーバーレイ
          Center(
            child: Container(
              width: 250,
              height: 250,
              decoration: BoxDecoration(
                border: Border.all(
                  color: _isProcessing ? Colors.orange : Colors.white,
                  width: 3,
                ),
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          if (_isProcessing)
            const Center(child: CircularProgressIndicator(color: Colors.white)),
        ],
      ),
    );
  }
}

// TicketBottomSheet を他の画面からも使えるよう公開クラスに
class TicketBottomSheet extends StatefulWidget {
  final String code;
  final TicketInfo ticket;
  final VoidCallback onCheckin;
  final VoidCallback onClose;

  const TicketBottomSheet({
    super.key,
    required this.code,
    required this.ticket,
    required this.onCheckin,
    required this.onClose,
  });

  @override
  State<TicketBottomSheet> createState() => _TicketBottomSheetState();
}

class _TicketBottomSheetState extends State<TicketBottomSheet> {
  bool _isCheckinLoading = false;

  @override
  Widget build(BuildContext context) {
    final ticket = widget.ticket;
    final isUsable = ticket.isUsable;

    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ドラッグハンドル
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey[300],
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 20),

          // ステータス表示
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
            decoration: BoxDecoration(
              color: isUsable
                  ? Colors.green.withValues(alpha: 0.1)
                  : Colors.red.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              isUsable ? '使用可能' : '使用済み',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: isUsable ? Colors.green : Colors.red,
              ),
              textAlign: TextAlign.center,
            ),
          ),
          const SizedBox(height: 20),

          // チケット情報
          _infoRow('コード', widget.code),
          _infoRow('注文番号', ticket.orderName),
          _infoRow('商品名', ticket.productName),
          if (ticket.variantTitle != null && ticket.variantTitle!.isNotEmpty)
            _infoRow('席種', ticket.variantTitle!),
          _infoRow(
            '座席',
            (ticket.reservedSeat != null &&
                    ticket.reservedSeat!.trim().isNotEmpty)
                ? ticket.reservedSeat!
                : '自由席',
          ),
          if (!isUsable && ticket.usedAt != null)
            _infoRow('使用日時', _formatDateTime(ticket.usedAt!)),

          const SizedBox(height: 24),

          // アクションボタン
          if (isUsable)
            SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton(
                style: FilledButton.styleFrom(backgroundColor: Colors.green),
                onPressed: _isCheckinLoading
                    ? null
                    : () {
                        setState(() => _isCheckinLoading = true);
                        widget.onCheckin();
                      },
                child: _isCheckinLoading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('チェックイン実行', style: TextStyle(fontSize: 18)),
              ),
            )
          else
            SizedBox(
              width: double.infinity,
              height: 52,
              child: OutlinedButton(
                onPressed: widget.onClose,
                child: const Text('閉じる', style: TextStyle(fontSize: 18)),
              ),
            ),

          if (isUsable) ...[
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 44,
              child: TextButton(
                onPressed: widget.onClose,
                child: const Text('キャンセル'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: TextStyle(color: Colors.grey[600], fontSize: 14),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }

  String _formatDateTime(String dateStr) {
    try {
      final dt = DateTime.parse(dateStr);
      return '${dt.year}/${dt.month.toString().padLeft(2, '0')}/${dt.day.toString().padLeft(2, '0')} '
          '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return dateStr;
    }
  }
}
