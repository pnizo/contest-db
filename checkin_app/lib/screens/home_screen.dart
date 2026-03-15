import 'dart:js_interop';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/auth_service.dart';
import '../services/checkin_service.dart';
import 'login_screen.dart';
import 'scanner_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  void initState() {
    super.initState();
    // URLのcodeパラメータをチェックし、あれば手動入力ダイアログを表示
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkUrlCode();
    });
  }

  void _checkUrlCode() {
    final uri = Uri.base;
    final code = uri.queryParameters['code'];
    if (code != null && code.isNotEmpty) {
      // URLからcodeパラメータを除去（再表示防止）
      _clearUrlCode();
      _showManualInputDialog(context, initialCode: code);
    }
  }

  void _clearUrlCode() {
    final uri = Uri.base;
    final params = Map<String, String>.from(uri.queryParameters)..remove('code');
    final newUri = uri.replace(queryParameters: params.isEmpty ? null : params);
    _jsReplaceState(newUri.toString());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('FWJ チェックイン'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'ログアウト',
            onPressed: () => _logout(context),
          ),
        ],
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.qr_code_scanner,
                size: 120,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(height: 32),
              Text(
                'チェックイン待機中',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 48),
              SizedBox(
                width: double.infinity,
                height: 56,
                child: FilledButton.icon(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const ScannerScreen(),
                      ),
                    );
                  },
                  icon: const Icon(Icons.camera_alt, size: 28),
                  label: const Text(
                    'QRコード読み取り',
                    style: TextStyle(fontSize: 18),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: OutlinedButton.icon(
                  onPressed: () => _showManualInputDialog(context),
                  icon: const Icon(Icons.keyboard),
                  label: const Text(
                    'コード手動入力',
                    style: TextStyle(fontSize: 16),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showManualInputDialog(BuildContext context, {String? initialCode}) {
    // 初期コードをフォーマット
    String? formatted;
    if (initialCode != null) {
      final clean = initialCode.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
      final buf = StringBuffer();
      for (var i = 0; i < clean.length && i < 12; i++) {
        if (i > 0 && i % 4 == 0) buf.write('-');
        buf.write(clean[i]);
      }
      formatted = buf.toString();
    }

    final controller = TextEditingController(text: formatted);
    final authService = AuthService();
    final checkinService = CheckinService(authService);

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('コード手動入力'),
        content: TextField(
          controller: controller,
          textAlign: TextAlign.center,
          decoration: const InputDecoration(
            hintText: 'XXXX-XXXX-XXXX',
            hintStyle: TextStyle(color: Colors.grey),
            border: OutlineInputBorder(),
          ),
          textCapitalization: TextCapitalization.characters,
          autofocus: true,
          inputFormatters: [CheckinCodeFormatter()],
          onSubmitted: (value) {
            Navigator.of(ctx).pop();
            final code = value.trim();
            if (code.isNotEmpty) {
              _processCode(context, checkinService, authService, code);
            }
          },
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('キャンセル'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              final code = controller.text.trim();
              if (code.isNotEmpty) {
                _processCode(context, checkinService, authService, code);
              }
            },
            child: const Text('確認'),
          ),
        ],
      ),
    );
  }

  /// コード形式チェック（ハイフン除去後12文字、Base32文字セットのみ）
  static final _validCodePattern = RegExp(r'^[A-HJ-NP-Z2-9]{12}$');

  static String? _validateCode(String code) {
    final clean = code.replaceAll('-', '').toUpperCase();
    if (clean.length != 12) {
      return '無効なコード形式です（12文字必要）';
    }
    if (!_validCodePattern.hasMatch(clean)) {
      return '無効なコード形式です';
    }
    return null;
  }

  Future<void> _processCode(
    BuildContext context,
    CheckinService checkinService,
    AuthService authService,
    String code,
  ) async {
    final validationError = _validateCode(code);
    if (validationError != null) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(validationError),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    final result = await checkinService.verify(code);

    if (!context.mounted) return;

    if (result.unauthorized) {
      await authService.logout();
      if (!context.mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
      );
      return;
    }

    if (result.error != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result.error!),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (result.ticket != null) {
      _showTicketSheet(context, checkinService, code, result.ticket!);
    }
  }

  void _showTicketSheet(
    BuildContext context,
    CheckinService checkinService,
    String code,
    TicketInfo ticket,
  ) {
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
        onCheckin: () async {
          final result = await checkinService.checkin(code);
          if (!ctx.mounted) return;
          Navigator.of(ctx).pop();
          if (!context.mounted) return;
          if (result.success) {
            final productDisplay = result.variantTitle != null
                ? '${result.productName} (${result.variantTitle})'
                : result.productName ?? '';
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('受付完了: ${result.orderName} $productDisplay'),
                backgroundColor: Colors.green,
              ),
            );
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(result.error ?? 'チェックインに失敗しました'),
                backgroundColor: Colors.red,
              ),
            );
          }
        },
        onClose: () => Navigator.of(ctx).pop(),
      ),
    );
  }

  Future<void> _logout(BuildContext context) async {
    await AuthService().logout();
    if (!context.mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }
}

/// チェックインコードの入力フォーマッター
/// 英字を大文字に変換し、4桁ごとにハイフンを自動挿入
class CheckinCodeFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    // 英数字以外を除去して大文字化
    final clean = newValue.text.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');

    // 4桁ごとにハイフン挿入
    final buffer = StringBuffer();
    for (var i = 0; i < clean.length && i < 12; i++) {
      if (i > 0 && i % 4 == 0) buffer.write('-');
      buffer.write(clean[i]);
    }

    final formatted = buffer.toString();
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}

@JS('window.history.replaceState')
external void _jsHistoryReplaceState(JSAny? state, String title, String url);

void _jsReplaceState(String url) {
  try {
    _jsHistoryReplaceState(null, '', url);
  } catch (_) {}
}
