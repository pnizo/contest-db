import 'dart:convert';
import 'package:http/http.dart' as http;
import 'auth_service.dart';
import '../config.dart';

class TicketInfo {
  final String orderName;
  final String productName;
  final String? variantTitle;
  final bool isUsable;
  final String? reservedSeat;
  final String? usedAt;

  TicketInfo({
    required this.orderName,
    required this.productName,
    this.variantTitle,
    required this.isUsable,
    this.reservedSeat,
    this.usedAt,
  });

  factory TicketInfo.fromJson(Map<String, dynamic> json) {
    return TicketInfo(
      orderName: json['orderName'] as String? ?? '',
      productName: json['productName'] as String? ?? '',
      variantTitle: json['variantTitle'] as String?,
      isUsable: json['isUsable'] as bool? ?? false,
      reservedSeat: json['reservedSeat'] as String?,
      usedAt: json['usedAt'] as String?,
    );
  }
}

class CheckinResult {
  final bool success;
  final String? message;
  final String? error;
  final String? orderName;
  final String? productName;
  final String? variantTitle;

  CheckinResult({
    required this.success,
    this.message,
    this.error,
    this.orderName,
    this.productName,
    this.variantTitle,
  });
}

class CheckinService {
  final AuthService _authService;

  CheckinService(this._authService);

  /// コード検証 → チケット情報を返す
  /// 401の場合はnullを返し、呼び出し元で再ログインを促す
  Future<({TicketInfo? ticket, String? error, bool unauthorized})> verify(
    String code,
  ) async {
    try {
      final headers = await _authService.authHeaders();
      final response = await http.post(
        Uri.parse('$apiBaseUrl/api/checkin/verify'),
        headers: headers,
        body: jsonEncode({'code': code}),
      );

      if (response.statusCode == 401) {
        return (ticket: null, error: null, unauthorized: true);
      }

      final data = jsonDecode(response.body);

      if (data['success'] == true) {
        return (
          ticket: TicketInfo.fromJson(data),
          error: null,
          unauthorized: false,
        );
      }

      return (
        ticket: null,
        error: data['error'] as String? ?? 'コード検証に失敗しました',
        unauthorized: false,
      );
    } catch (e) {
      return (ticket: null, error: '通信エラーが発生しました', unauthorized: false);
    }
  }

  /// チェックイン実行
  Future<CheckinResult> checkin(String code) async {
    try {
      final headers = await _authService.authHeaders();
      final response = await http.post(
        Uri.parse('$apiBaseUrl/api/checkin'),
        headers: headers,
        body: jsonEncode({'code': code}),
      );

      if (response.statusCode == 401) {
        return CheckinResult(success: false, error: '認証エラー。再ログインしてください。');
      }

      final data = jsonDecode(response.body);

      if (data['success'] == true) {
        return CheckinResult(
          success: true,
          message: data['message'] as String?,
          orderName: data['orderName'] as String?,
          productName: data['productName'] as String?,
          variantTitle: data['variantTitle'] as String?,
        );
      }

      return CheckinResult(
        success: false,
        error: data['error'] as String? ?? 'チェックインに失敗しました',
      );
    } catch (e) {
      return CheckinResult(success: false, error: '通信エラーが発生しました');
    }
  }
}
